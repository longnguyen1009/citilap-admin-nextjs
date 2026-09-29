-- Allow the purchase-item editor to persist the same VND import price as creation.
BEGIN;
CREATE OR REPLACE FUNCTION public.update_laptop_procurement(
  p_laptop_id bigint, p_data jsonb, p_actor text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE l laptops%ROWTYPE; target_batch purchase_batches%ROWTYPE; next_tracking text;
BEGIN
  SELECT * INTO l FROM laptops WHERE id=p_laptop_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ ngá»«ng sá»­ dá»¥ng'; END IF;
  IF l.status='sold' THEN RAISE EXCEPTION 'Laptop Ä‘Ã£ bÃ¡n: dá»¯ liá»‡u mua hÃ ng lÃ  báº¥t biáº¿n'; END IF;
  IF l.status='supplier_return' AND EXISTS(
    SELECT 1 FROM supplier_refunds sr
    JOIN supplier_return_items sri ON sri.supplier_return_id=sr.supplier_return_id
    WHERE sri.laptop_id=l.id
  ) THEN RAISE EXCEPTION 'Laptop Ä‘ang tráº£ NCC vÃ  Ä‘Ã£ phÃ¡t sinh tÃ i chÃ­nh'; END IF;
  IF l.status NOT IN('in_transit','waiting_qc','repair','available','reserved','supplier_return') THEN
    RAISE EXCEPTION 'Tráº¡ng thÃ¡i laptop khÃ´ng cho phÃ©p sá»­a dá»¯ liá»‡u mua hÃ ng';
  END IF;
  IF p_data ? 'name' AND length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'TÃªn mÃ¡y khÃ´ng há»£p lá»‡';
  END IF;
  IF p_data ? 'category' AND NOT EXISTS(
    SELECT 1 FROM app_options o
    WHERE o.group_key='category' AND o.option_key=p_data->>'category' AND o.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'PhÃ¢n loáº¡i mÃ¡y khÃ´ng há»£p lá»‡'; END IF;
  IF p_data ? 'purchase_price_rmb' AND (p_data->>'purchase_price_rmb')::numeric < 0 THEN
    RAISE EXCEPTION 'GiÃ¡ mua khÃ´ng há»£p lá»‡';
  END IF;
  IF p_data ? 'shipping_rmb' AND coalesce(nullif(p_data->>'shipping_rmb','')::numeric,0) < 0 THEN
    RAISE EXCEPTION 'PhÃ­ váº­n chuyá»ƒn khÃ´ng há»£p lá»‡';
  END IF;
  IF p_data ? 'import_price_vnd' AND nullif(p_data->>'import_price_vnd','') IS NOT NULL
     AND (p_data->>'import_price_vnd')::numeric < 0 THEN
    RAISE EXCEPTION 'GiÃ¡ nháº­p VNÄ khÃ´ng há»£p lá»‡';
  END IF;

  next_tracking:=CASE WHEN p_data ? 'tracking_code_cn'
    THEN left(btrim(coalesce(p_data->>'tracking_code_cn','')),200)
    ELSE l.tracking_code_cn END;
  IF EXISTS(
    SELECT 1 FROM laptops x WHERE x.id<>l.id AND x.is_active IS TRUE
      AND btrim(next_tracking)<>''
      AND lower(btrim(x.tracking_code_cn))=lower(btrim(next_tracking))
  ) THEN RAISE EXCEPTION 'MÃ£ váº­n chuyá»ƒn Ä‘Ã£ Ä‘Æ°á»£c dÃ¹ng cho laptop khÃ¡c'; END IF;

  IF p_data ? 'purchase_batch_id' THEN
    SELECT * INTO target_batch FROM purchase_batches
    WHERE id=(p_data->>'purchase_batch_id')::bigint AND active IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LÃ´ mua Ä‘Ã­ch khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ ngá»«ng sá»­ dá»¥ng'; END IF;
    IF EXISTS(SELECT 1 FROM supplier_payments WHERE purchase_batch_id=l.purchase_batch_id)
       AND target_batch.id IS DISTINCT FROM l.purchase_batch_id THEN
      RAISE EXCEPTION 'KhÃ´ng thá»ƒ chuyá»ƒn lÃ´ sau khi lÃ´ nguá»“n Ä‘Ã£ phÃ¡t sinh thanh toÃ¡n NCC';
    END IF;
  END IF;

  UPDATE laptops SET
    name=CASE WHEN p_data ? 'name' THEN left(btrim(p_data->>'name'),240) ELSE name END,
    category=CASE WHEN p_data ? 'category' THEN p_data->>'category' ELSE category END,
    serial=CASE WHEN p_data ? 'serial' THEN nullif(left(btrim(coalesce(p_data->>'serial','')),100),'') ELSE serial END,
    tracking_code_cn=next_tracking,tracking_code=nullif(next_tracking,''),
    purchase_price_rmb=CASE WHEN p_data ? 'purchase_price_rmb' THEN (p_data->>'purchase_price_rmb')::numeric ELSE purchase_price_rmb END,
    price_rmb=CASE WHEN p_data ? 'purchase_price_rmb' THEN (p_data->>'purchase_price_rmb')::numeric ELSE price_rmb END,
    shipping_rmb=CASE WHEN p_data ? 'shipping_rmb' THEN coalesce(nullif(p_data->>'shipping_rmb','')::numeric,0) ELSE shipping_rmb END,
    import_price_vnd=CASE WHEN p_data ? 'import_price_vnd' AND nullif(p_data->>'import_price_vnd','') IS NOT NULL
      THEN (p_data->>'import_price_vnd')::numeric ELSE import_price_vnd END,
    condition_note=CASE WHEN p_data ? 'notes' THEN left(coalesce(p_data->>'notes',''),2000) ELSE condition_note END,
    purchase_batch_id=CASE WHEN p_data ? 'purchase_batch_id' THEN target_batch.id ELSE purchase_batch_id END,
    purchase_exchange_rate=CASE WHEN p_data ? 'purchase_batch_id' THEN target_batch.exchange_rate ELSE purchase_exchange_rate END,
    exchange_rate=CASE WHEN p_data ? 'purchase_batch_id' THEN target_batch.exchange_rate ELSE exchange_rate END,
    import_date=CASE WHEN p_data ? 'purchase_batch_id' THEN target_batch.purchase_date ELSE import_date END,
    month_key=CASE WHEN p_data ? 'purchase_batch_id' THEN to_char(target_batch.purchase_date,'MM/YYYY') ELSE month_key END
  WHERE id=l.id RETURNING * INTO l;
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('LAPTOP',l.id::text,'UPDATE',jsonb_build_object('event','PROCUREMENT_CORRECTED','fields',p_data),p_actor);
  RETURN to_jsonb(l);
END;
$$;
REVOKE ALL ON FUNCTION public.update_laptop_procurement(bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_laptop_procurement(bigint,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

