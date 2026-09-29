-- Repair Vietnamese user-facing messages that were double encoded in the
-- baseline. RPC errors should be valid UTF-8 at the source.
CREATE OR REPLACE FUNCTION public.issue_invoice(p_order_id bigint, p_actor text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  o orders%ROWTYPE;
  l laptops%ROWTYPE;
  c customers%ROWTYPE;
  b branches%ROWTYPE;
  i invoices%ROWTYPE;
  items jsonb;
  receipts jsonb;
  finance jsonb;
  ledger_total numeric;
  effective_paid numeric;
  deposit_total numeric;
  a accessories%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy đơn hàng'; END IF;

  SELECT * INTO i FROM invoices WHERE order_id = p_order_id;
  IF FOUND THEN RETURN to_jsonb(i); END IF;

  IF o.is_active IS NOT TRUE OR o.order_status NOT IN ('shipping', 'done') THEN
    RAISE EXCEPTION 'Chỉ xuất hóa đơn khi đơn đang giao hàng hoặc đã hoàn thành';
  END IF;
  IF coalesce(o.sale_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Đơn hàng chưa có giá bán hợp lệ';
  END IF;

  SELECT * INTO b FROM branches WHERE id = o.branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vui lòng chọn chi nhánh bán hàng trong đơn'; END IF;
  SELECT * INTO l FROM laptops WHERE id = o.laptop_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Đơn chưa có laptop'; END IF;
  SELECT * INTO c FROM customers WHERE id = o.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vui lòng chọn khách hàng có tên, SĐT và địa chỉ'; END IF;
  IF coalesce(btrim(c.name), '') = '' OR coalesce(btrim(c.phone), '') = '' THEN
    RAISE EXCEPTION 'Khách hàng thiếu tên hoặc số điện thoại';
  END IF;

  SELECT
    coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.payment_date, p.id), '[]'),
    coalesce(sum(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END), 0),
    coalesce(sum(CASE WHEN p.payment_type = 'deposit' THEN p.amount ELSE 0 END), 0)
  INTO receipts, ledger_total, deposit_total
  FROM payments p
  WHERE p.order_id = o.id;

  effective_paid := greatest(ledger_total, coalesce(o.amount_paid, 0));
  IF (deposit_total <= 0 AND coalesce(o.deposit_amount, 0) <= 0
      AND NOT (o.payment_status = 'paid' AND coalesce(o.amount_paid, 0) > 0))
     OR effective_paid <= 0 THEN
    RAISE EXCEPTION 'Cần ghi nhận ít nhất một khoản đặt cọc trước khi xuất hóa đơn';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.occurred_on, f.id), '[]')
    INTO finance
    FROM financial_records f
   WHERE f.order_id = o.id;

  items := jsonb_build_array(jsonb_build_object(
    'kind', 'laptop', 'id', l.id, 'sku', l.sku, 'name', l.name,
    'quantity', 1, 'price', o.sale_price, 'total', o.sale_price,
    'serial', l.serial,
    'note', concat_ws(' · ', l.condition_note, o.warranty, o.setup_note)
  ));

  FOR a IN
    SELECT * FROM accessories
    WHERE id IN (SELECT value::bigint FROM jsonb_array_elements_text(o.gift_accessory_ids))
    ORDER BY id
  LOOP
    items := items || jsonb_build_array(jsonb_build_object(
      'kind', 'gift', 'id', a.id, 'sku', a.sku, 'name', a.name,
      'quantity', 1, 'price', 0, 'total', 0, 'serial', '', 'note', a.note
    ));
  END LOOP;

  INSERT INTO invoices(order_id, laptop_id, customer_id, created_by, snapshot)
  VALUES (
    o.id, l.id, c.id, p_actor,
    jsonb_build_object(
      'order', to_jsonb(o), 'customer', to_jsonb(c), 'branch', to_jsonb(b),
      'items', items, 'payments', receipts, 'financial_records', finance,
      'total', o.sale_price, 'paid', effective_paid,
      'currency', 'VND', 'unit_multiplier', 1000000
    )
  ) RETURNING * INTO i;

  RETURN to_jsonb(i);
END
$function$;
