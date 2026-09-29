-- A tracking code identifies a shipment/package and may belong to many laptops.
BEGIN;

DROP INDEX IF EXISTS public.laptops_tracking_code_cn_unique_idx;

CREATE OR REPLACE FUNCTION public.update_incoming_tracking(
  p_laptop_id bigint, p_tracking text, p_actor text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE l laptops%ROWTYPE; old_tracking text;
  normalized text:=left(btrim(coalesce(p_tracking,'')),200);
BEGIN
  SELECT tracking_code_cn INTO old_tracking
  FROM laptops WHERE id=p_laptop_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop không tồn tại hoặc đã ngừng sử dụng'; END IF;
  UPDATE laptops SET tracking_code_cn=normalized,tracking_code=nullif(normalized,'')
  WHERE id=p_laptop_id RETURNING * INTO l;
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('LAPTOP',l.id::text,'UPDATE',jsonb_build_object(
    'event','TRACKING_CORRECTED','old',old_tracking,'new',l.tracking_code_cn),p_actor);
  RETURN to_jsonb(l);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_laptop_procurement(
  p_laptop_id bigint, p_data jsonb, p_actor text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE l laptops%ROWTYPE; target_batch purchase_batches%ROWTYPE; next_tracking text;
BEGIN
  SELECT * INTO l FROM laptops WHERE id=p_laptop_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Laptop không tồn tại hoặc đã ngừng sử dụng'; END IF;
  IF l.status='sold' THEN RAISE EXCEPTION 'Laptop đã bán: dữ liệu mua hàng là bất biến'; END IF;
  IF l.status='supplier_return' AND EXISTS(
    SELECT 1 FROM supplier_refunds sr
    JOIN supplier_return_items sri ON sri.supplier_return_id=sr.supplier_return_id
    WHERE sri.laptop_id=l.id
  ) THEN RAISE EXCEPTION 'Laptop đang trả NCC và đã phát sinh tài chính'; END IF;
  IF l.status NOT IN('in_transit','waiting_qc','repair','available','reserved','supplier_return') THEN
    RAISE EXCEPTION 'Trạng thái laptop không cho phép sửa dữ liệu mua hàng';
  END IF;
  IF p_data ? 'name' AND length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'Tên máy không hợp lệ';
  END IF;
  IF p_data ? 'category' AND NOT EXISTS(
    SELECT 1 FROM app_options o WHERE o.group_key='category'
      AND o.option_key=p_data->>'category' AND o.is_active IS TRUE
  ) THEN RAISE EXCEPTION 'Phân loại máy không hợp lệ'; END IF;
  IF p_data ? 'purchase_price_rmb' AND (p_data->>'purchase_price_rmb')::numeric < 0 THEN
    RAISE EXCEPTION 'Giá mua không hợp lệ';
  END IF;
  IF p_data ? 'shipping_rmb' AND coalesce(nullif(p_data->>'shipping_rmb','')::numeric,0) < 0 THEN
    RAISE EXCEPTION 'Phí vận chuyển không hợp lệ';
  END IF;
  IF p_data ? 'import_price_vnd' AND nullif(p_data->>'import_price_vnd','') IS NOT NULL
     AND (p_data->>'import_price_vnd')::numeric < 0 THEN
    RAISE EXCEPTION 'Giá nhập VNĐ không hợp lệ';
  END IF;
  next_tracking:=CASE WHEN p_data ? 'tracking_code_cn'
    THEN left(btrim(coalesce(p_data->>'tracking_code_cn','')),200)
    ELSE l.tracking_code_cn END;
  IF p_data ? 'purchase_batch_id' THEN
    SELECT * INTO target_batch FROM purchase_batches
    WHERE id=(p_data->>'purchase_batch_id')::bigint AND active IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lô mua đích không tồn tại hoặc đã ngừng sử dụng'; END IF;
    IF EXISTS(SELECT 1 FROM supplier_payments WHERE purchase_batch_id=l.purchase_batch_id)
       AND target_batch.id IS DISTINCT FROM l.purchase_batch_id THEN
      RAISE EXCEPTION 'Không thể chuyển lô sau khi lô nguồn đã phát sinh thanh toán NCC';
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
  VALUES('LAPTOP',l.id::text,'UPDATE',jsonb_build_object(
    'event','PROCUREMENT_CORRECTED','fields',p_data),p_actor);
  RETURN to_jsonb(l);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_laptop_to_purchase_batch(
  p_batch_id bigint, p_laptop jsonb, p_actor text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE b purchase_batches%ROWTYPE; l laptops%ROWTYPE; cached jsonb;
  extra_vnd numeric:=400000; divisor numeric:=1000000; import_price numeric;
BEGIN
  SELECT result INTO cached FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='ADD_LAPTOP_TO_PURCHASE_BATCH';
  IF FOUND THEN RETURN cached; END IF;
  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'Mã chống gửi trùng không hợp lệ'; END IF;
  SELECT * INTO b FROM purchase_batches WHERE id=p_batch_id AND active IS TRUE FOR SHARE;
  IF NOT FOUND OR b.status IN('CLOSED','CANCELLED') THEN
    RAISE EXCEPTION 'Lô mua không tồn tại hoặc đã đóng'; END IF;
  IF length(btrim(coalesce(p_laptop->>'name',''))) NOT BETWEEN 1 AND 240
    OR NOT EXISTS(SELECT 1 FROM app_options o WHERE o.group_key='category'
      AND o.option_key=p_laptop->>'category' AND o.is_active IS TRUE)
    OR coalesce(nullif(p_laptop->>'purchase_price_rmb','')::numeric,-1)<0
    OR coalesce(nullif(p_laptop->>'shipping_rmb','')::numeric,0)<0 THEN
    RAISE EXCEPTION 'Thông tin máy không hợp lệ'; END IF;
  SELECT coalesce(nullif(value->>'shippingVnd','')::numeric,400000),
         coalesce(nullif(value->>'divisor','')::numeric,1000000)
    INTO extra_vnd,divisor FROM app_settings WHERE key='formula';
  extra_vnd:=coalesce(extra_vnd,400000);
  divisor:=coalesce(divisor,1000000);
  import_price:=coalesce(nullif(p_laptop->>'import_price_vnd','')::numeric,
    round(((p_laptop->>'purchase_price_rmb')::numeric+
      coalesce(nullif(p_laptop->>'shipping_rmb','')::numeric,0))*b.exchange_rate+extra_vnd,2)/divisor);
  IF import_price<0 THEN RAISE EXCEPTION 'Giá nhập VNĐ không hợp lệ'; END IF;
  INSERT INTO laptops(name,category,serial,tracking_code_cn,tracking_code,
    purchase_price_rmb,price_rmb,shipping_rmb,purchase_exchange_rate,exchange_rate,
    import_price_vnd,purchase_batch_id,source_type,source_reference_id,status,location,
    charger_status,is_active,condition_note,created_by,import_date,month_key)
  VALUES(btrim(p_laptop->>'name'),p_laptop->>'category',
    nullif(left(btrim(coalesce(p_laptop->>'serial','')),100),''),
    left(btrim(coalesce(p_laptop->>'tracking_code_cn','')),200),
    nullif(left(btrim(coalesce(p_laptop->>'tracking_code_cn','')),200),''),
    (p_laptop->>'purchase_price_rmb')::numeric,(p_laptop->>'purchase_price_rmb')::numeric,
    coalesce(nullif(p_laptop->>'shipping_rmb','')::numeric,0),b.exchange_rate,b.exchange_rate,
    import_price,b.id,'SUPPLIER_PURCHASE',b.id::text,'in_transit','wh_cn','unchecked',true,
    left(coalesce(p_laptop->>'notes',''),2000),p_actor,b.purchase_date,to_char(b.purchase_date,'MM/YYYY'))
  RETURNING * INTO l;
  cached:=to_jsonb(l);
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'ADD_LAPTOP_TO_PURCHASE_BATCH',cached,p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('LAPTOP',l.id::text,'CREATE',jsonb_build_object(
    'event','LAPTOP_ADDED_TO_BATCH','purchase_batch_id',b.id,'batch_code',b.batch_code),p_actor);
  RETURN cached;
END;
$$;

REVOKE ALL ON FUNCTION public.update_incoming_tracking(bigint,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_laptop_procurement(bigint,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.add_laptop_to_purchase_batch(bigint,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_incoming_tracking(bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_laptop_procurement(bigint,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_laptop_to_purchase_batch(bigint,jsonb,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
