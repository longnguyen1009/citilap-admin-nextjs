-- Add a laptop directly to an existing purchase batch without creating a temporary batch.
BEGIN;
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
  IF btrim(coalesce(p_laptop->>'tracking_code_cn',''))<>'' AND EXISTS(
    SELECT 1 FROM laptops x WHERE x.is_active IS TRUE AND
      lower(btrim(x.tracking_code_cn))=lower(btrim(p_laptop->>'tracking_code_cn'))
  ) THEN RAISE EXCEPTION 'Mã vận chuyển đã được dùng cho laptop khác'; END IF;
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
  VALUES('LAPTOP',l.id::text,'CREATE',jsonb_build_object('event','LAPTOP_ADDED_TO_BATCH',
    'purchase_batch_id',b.id,'batch_code',b.batch_code),p_actor);
  RETURN cached;
END;
$$;
REVOKE ALL ON FUNCTION public.add_laptop_to_purchase_batch(bigint,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_laptop_to_purchase_batch(bigint,jsonb,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
