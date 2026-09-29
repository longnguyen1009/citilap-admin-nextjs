-- Persist the VND import price entered or calculated in the purchase-batch UI.
BEGIN;
CREATE OR REPLACE FUNCTION public.create_purchase_batch(
  p_batch jsonb, p_laptops jsonb, p_actor text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  b purchase_batches%ROWTYPE;
  entry jsonb;
  created_rows jsonb;
  rate numeric;
  extra_vnd numeric;
  divisor numeric;
  import_price numeric;
BEGIN
  SELECT result INTO created_rows FROM operation_requests
  WHERE idempotency_key=p_idempotency_key AND operation='CREATE_PURCHASE_BATCH';
  IF FOUND THEN RETURN created_rows; END IF;

  IF length(btrim(coalesce(p_idempotency_key,''))) NOT BETWEEN 8 AND 100
     OR jsonb_typeof(p_laptops) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_laptops) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Lô mua phải có từ 1 đến 200 máy';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM suppliers
    WHERE id=(p_batch->>'supplier_id')::uuid AND active
  ) THEN
    RAISE EXCEPTION 'Nhà cung cấp không tồn tại hoặc đã ngừng sử dụng';
  END IF;

  rate:=coalesce(nullif(p_batch->>'purchase_exchange_rate','')::numeric,
                 nullif(p_batch->>'exchange_rate','')::numeric);
  IF rate IS NULL OR rate<=0 THEN RAISE EXCEPTION 'Tỷ giá mua không hợp lệ'; END IF;
  SELECT coalesce(nullif(value->>'shippingVnd','')::numeric,400000),
         coalesce(nullif(value->>'divisor','')::numeric,1000000)
    INTO extra_vnd,divisor FROM app_settings WHERE key='formula';
  extra_vnd:=coalesce(extra_vnd,400000);
  divisor:=coalesce(divisor,1000000);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_laptops) x WHERE
      length(btrim(coalesce(x->>'name',''))) NOT BETWEEN 1 AND 240
      OR NOT EXISTS (
        SELECT 1 FROM app_options o
        WHERE o.group_key='category' AND o.option_key=x->>'category' AND o.is_active IS TRUE
      )
      OR coalesce(nullif(x->>'purchase_price_rmb','')::numeric,-1)<0
      OR coalesce(nullif(x->>'shipping_rmb','')::numeric,0)<0
      OR coalesce(nullif(x->>'import_price_vnd','')::numeric,-1)<0
      OR length(coalesce(x->>'tracking_code_cn',''))>200
  ) THEN
    RAISE EXCEPTION 'Thông tin máy trong lô không hợp lệ';
  END IF;

  INSERT INTO purchase_batches(batch_code,supplier_id,purchase_date,currency,exchange_rate,
    subtotal_rmb,domestic_shipping_rmb,other_cost_rmb,destination,status,notes,active,
    created_by,updated_by,idempotency_key,procurement_flow)
  VALUES(next_purchase_batch_code((p_batch->>'purchase_date')::date),
    (p_batch->>'supplier_id')::uuid,(p_batch->>'purchase_date')::date,'CNY',rate,
    0,0,0,'OTHER','CONFIRMED',left(coalesce(p_batch->>'notes',''),3000),true,
    p_actor,p_actor,p_idempotency_key,'DIRECT')
  RETURNING * INTO b;

  FOR entry IN SELECT value FROM jsonb_array_elements(p_laptops) LOOP
    import_price:=coalesce(
      nullif(entry->>'import_price_vnd','')::numeric,
      round((
        (entry->>'purchase_price_rmb')::numeric
        + coalesce(nullif(entry->>'shipping_rmb','')::numeric,0)
      ) * rate + extra_vnd,2) / divisor
    );
    INSERT INTO laptops(name,category,serial,tracking_code_cn,purchase_price_rmb,shipping_rmb,
      purchase_exchange_rate,import_price_vnd,purchase_batch_id,source_type,status,location,
      charger_status,is_active,condition_note,created_by,import_date,month_key,price_rmb,
      exchange_rate,tracking_code)
    VALUES(btrim(entry->>'name'),entry->>'category',
      nullif(left(btrim(coalesce(entry->>'serial','')),100),''),
      left(btrim(coalesce(entry->>'tracking_code_cn','')),200),
      (entry->>'purchase_price_rmb')::numeric,
      coalesce(nullif(entry->>'shipping_rmb','')::numeric,0),rate,import_price,b.id,
      'SUPPLIER_PURCHASE','in_transit','wh_cn','unchecked',true,
      left(coalesce(entry->>'notes',''),2000),p_actor,b.purchase_date,
      to_char(b.purchase_date,'MM/YYYY'),(entry->>'purchase_price_rmb')::numeric,rate,
      left(btrim(coalesce(entry->>'tracking_code_cn','')),200));
  END LOOP;

  SELECT jsonb_build_object('batch',to_jsonb(b),
    'laptops',coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb))
  INTO created_rows FROM laptops l WHERE l.purchase_batch_id=b.id;
  INSERT INTO operation_requests(idempotency_key,operation,result,created_by)
  VALUES(p_idempotency_key,'CREATE_PURCHASE_BATCH',created_rows,p_actor);
  INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name)
  VALUES('PURCHASE_BATCH',b.id::text,'CREATE',
    jsonb_build_object('batch_code',b.batch_code,'laptop_count',jsonb_array_length(p_laptops)),p_actor);
  RETURN created_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.create_purchase_batch(jsonb,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_batch(jsonb,jsonb,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
