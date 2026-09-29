-- DESTRUCTIVE TEST RESET: 30 laptops and 20 orders across August-September 2026.
-- Requires the current generated init_full_db.sql. Preserves auth/profiles.
BEGIN;
SET LOCAL search_path = public, pg_temp;
TRUNCATE TABLE operation_requests, financial_records, payments, stock_movements, warranty_cases,
 orders, laptops, customers, activity_logs, app_settings, cash_accounts,
 suppliers, purchase_batches, supplier_returns, trade_ins RESTART IDENTITY CASCADE;
ALTER SEQUENCE public.laptop_sku_seq RESTART WITH 1;

INSERT INTO cash_accounts(code,name,account_type,currency,opening_balance,opening_balance_at,created_by) VALUES
 ('SEED_CASH','Tiền mặt','CASH','VND',50000000,'2026-08-01T00:00:00+07','Seed'),
 ('SEED_BANK','Ngân hàng','BANK','VND',200000000,'2026-08-01T00:00:00+07','Seed'),
 ('SEED_CNY','WeChat CNY','WECHAT','CNY',100000,'2026-08-01T00:00:00+07','Seed');
INSERT INTO app_settings(key,value) VALUES
 ('formula','{"shippingVnd":400000,"divisor":1000000,"defaultRate":3990}'::jsonb);

DELETE FROM app_options WHERE group_key='category';
INSERT INTO app_options(group_key,option_key,label,is_active,sort_order) VALUES
 ('category','1','ACER Nitro 5',true,0),('category','2','ROG G513 2021',true,1),
 ('category','3','ROG G513 2022',true,2),('category','4','ROG Scar 2022',true,3),
 ('category','5','ROG G713 2022',true,4),('category','6','ROG M16 21-22-23',true,5),
 ('category','7','ROG G16-G18',true,6),('category','8','Asus Zephyrus G14',true,7),
 ('category','9','ROG FLOW',true,8),('category','10','ASUS TUF',true,9),
 ('category','11','ASUS',true,10),('category','12','LEGION 5 2021',true,11),
 ('category','13','LEGION 5 2022',true,12),('category','14','LEGION 5 2023',true,13),
 ('category','15','LEGION 5 Pro 2021',true,14),('category','16','LEGION 5 Pro 2022',true,15),
 ('category','17','LEGION 5 Pro 2023 - 2024',true,16),('category','18','Legion 7 21-22-23',true,17),
 ('category','19','LEGION Slim 7 21-22-23',true,18),('category','20','ACER',true,19),
 ('category','21','ACER Helios Neo 2023-2024',true,20),('category','22','DELL',true,21),
 ('category','23','RAZER',true,22),('category','24','ROG G15',true,23),
 ('category','25','LOQ',true,24),('category','26','MSI',true,25),
 ('category','27','Lenovo',true,26),('category','28','HP',true,27),
 ('category','29','MACBOOK',true,28),('category','30','Huawei',true,29),
 ('category','31','Xiaomi',true,30);
INSERT INTO app_options(group_key,option_key,label,sort_order) VALUES
 ('saleOffline','1','Thắng',0),('saleOffline','2','Vương',1),('saleOffline','other','Khác',2)
ON CONFLICT (group_key,option_key) DO UPDATE
SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,is_active=true;

INSERT INTO suppliers(code,name,display_name,wechat_name,country,active,created_by) VALUES
 ('WE_MOMING','We-莫名','We-莫名','We-莫名','Trung Quốc',true,'Seed'),
 ('WE_HUONG','We-Hướng','We-Hướng','We-Hướng','Trung Quốc',true,'Seed'),
 ('WE_HOITHU','We-Hồi Thu','We-Hồi Thu','We-Hồi Thu','Trung Quốc',true,'Seed'),
 ('WE_MAO','We-Mão','We-Mão','We-Mão','Trung Quốc',true,'Seed'),
 ('WE_DD','We-DD','We-DD','We-DD','Trung Quốc',true,'Seed'),
 ('XIANYU','Xianyu','Xianyu','Xianyu','Trung Quốc',true,'Seed'),
 ('WE_ABAC','We-A Bắc','We-A Bắc','We-A Bắc','Trung Quốc',true,'Seed'),
 ('WE_ABUTKI','We-A Bút Kí','We-A Bút Kí','We-A Bút Kí','Trung Quốc',true,'Seed'),
 ('WE_LI','We-李','We-李','We-李','Trung Quốc',true,'Seed'),
 ('WE_WANDAXY','We-万达闲鱼','We-万达闲鱼','We-万达闲鱼','Trung Quốc',true,'Seed'),
 ('WE_WANFAWEI','We-万法唯','We-万法唯','We-万法唯','Trung Quốc',true,'Seed'),
 ('WE_XUYING','We-徐迎','We-徐迎','We-徐迎','Trung Quốc',true,'Seed'),
 ('WE_WANJIA','We-玩家','We-玩家','We-玩家','Trung Quốc',true,'Seed'),
 ('NHAP_THO','Nhập thợ','Nhập thợ','Nhập thợ','Việt Nam',true,'Seed'),
 ('WE_MAIDI','We-麦迪','We-麦迪','We-麦迪','Trung Quốc',true,'Seed'),
 ('WE_YONGGE','We-勇哥 🧮 13878190009','We-勇哥 🧮 13878190009','We-勇哥','Trung Quốc',true,'Seed');

DO $$
DECLARE
 m integer; n integer; category_no integer; month text; imported date; ordered date;
 stamp timestamptz; supplier_id uuid; batch_id bigint; laptop laptops%ROWTYPE;
 customer customers%ROWTYPE; result jsonb; qc jsonb; order_id bigint; account uuid;
 sale numeric; cost numeric; order_status text; laptop_id bigint;
 categories text[]:=ARRAY['ACER Nitro 5','ROG G513 2021','ROG G513 2022','ROG Scar 2022',
 'ROG G713 2022','ROG M16 21-22-23','ROG G16-G18','Asus Zephyrus G14','ROG FLOW','ASUS TUF',
 'ASUS','LEGION 5 2021','LEGION 5 2022','LEGION 5 2023','LEGION 5 Pro 2021',
 'LEGION 5 Pro 2022','LEGION 5 Pro 2023 - 2024','Legion 7 21-22-23',
 'LEGION Slim 7 21-22-23','ACER','ACER Helios Neo 2023-2024','DELL','RAZER','ROG G15','LOQ',
 'MSI','Lenovo','HP','MACBOOK','Huawei','Xiaomi'];
 buyers text[]:=ARRAY['Nguyễn Văn An','Trần Thị Bình','Lê Minh Châu','Phạm Quốc Dũng',
 'Hoàng Thu Hà','Vũ Gia Huy','Đặng Ngọc Lan','Bùi Đức Minh','Đỗ Phương Nam','Ngô Hải Yến'];
BEGIN
 FOR m IN 8..9 LOOP
  month:=to_char(make_date(2026,m,1),'MM/YYYY');
  SELECT id INTO supplier_id FROM suppliers WHERE code=CASE WHEN m=8 THEN 'WE_MOMING' ELSE 'WE_HUONG' END;
  INSERT INTO purchase_batches(batch_code,supplier_id,purchase_date,currency,exchange_rate,destination,
   status,notes,active,created_by,updated_by,procurement_flow)
  VALUES(format('PO-2026%s-SEED',lpad(m::text,2,'0')),supplier_id,make_date(2026,m,1),'CNY',3990,
   'GUANGXI','RECEIVED','Lô mẫu tháng '||month,true,'Seed','Seed','DIRECT') RETURNING id INTO batch_id;
  FOR n IN 1..15 LOOP
   category_no:=1+((m-8)*15+n-1)%31; imported:=make_date(2026,m,1+(n-1)%5);
   stamp:=(imported+TIME '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
   cost:=round(((2800+category_no*70+n*15+50)*3990+400000)::numeric/1000000,2);
   INSERT INTO laptops(serial,name,category,import_date,warehouse_date,month_key,location,charger_status,
    status,seller,price_rmb,shipping_rmb,exchange_rate,import_price_vnd,wholesale_price_vnd,retail_price_vnd,
    battery_health,screen_status,camera_mic_status,mainboard_status,condition_note,warranty_supplier,is_active,
    created_at,updated_at,source_type,source_reference_id,purchase_batch_id,tracking_code_cn,purchase_price_rmb,
    purchase_exchange_rate,received_at,created_by)
   VALUES(format('CT-2026%s-%s',lpad(m::text,2,'0'),lpad(n::text,3,'0')),
    categories[category_no]||' (R7/16GB/1TB/RTX4060)',category_no::text,imported,imported+2,month,'store',
    'with_charger','waiting_qc','',2800+category_no*70+n*15,50,3990,cost,cost+1.5,cost+3,85+n%15,
    'ok','ok','ok','Máy đẹp, hoạt động tốt','Bảo hành nhà cung cấp 3 tháng',true,stamp,stamp,
    'SUPPLIER_PURCHASE',batch_id::text,batch_id,format('CN-2026%s-%s',lpad(m::text,2,'0'),lpad(n::text,3,'0')),
    2800+category_no*70+n*15,3990,stamp+INTERVAL '2 days','Seed') RETURNING * INTO laptop;
   INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,created_at)
   VALUES(laptop.id,'RECEIVED','KHO TQ','CH','Nhận hàng mẫu tháng '||month,'Seed',stamp+INTERVAL '2 days');
   qc:=public.start_qc_inspection(laptop.id,'Seed',format('seed-qc-start-%s-%s',m,n));
   PERFORM public.complete_qc_with_details((qc->>'id')::uuid,'PASS','QC mẫu: Đạt','Seed',
    format('seed-qc-done-%s-%s',m,n),(SELECT jsonb_object_agg(f.key,jsonb_build_object('result','PASS'))
    FROM unnest(ARRAY['mainboard','screen','keyboard','touchpad','camera','microphone','speaker','wifi',
    'bluetooth','usb','usb_c','hdmi','lan','ssd_health','fan','cpu_stress','gpu_stress','charger','exterior']) f(key)));
  END LOOP;
  FOR n IN 1..10 LOOP
   ordered:=make_date(2026,m,7+(n-1)%14); stamp:=(ordered+TIME '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
   SELECT * INTO laptop FROM laptops WHERE month_key=month ORDER BY id OFFSET n-1 LIMIT 1;
   INSERT INTO customers(name,phone,address,created_at,updated_at)
   VALUES(buyers[n],format('09%s%s',m,lpad(n::text,7,'0')),format('%s Nguyễn Trãi, Hà Nội',10+n),stamp,stamp)
   RETURNING * INTO customer;
   order_status:=CASE WHEN n<=4 THEN 'done' WHEN n IN(5,6) THEN 'deposited' WHEN n=7 THEN 'prepared'
    WHEN n=8 THEN 'shipping' WHEN n=9 THEN 'new' ELSE 'cancelled' END;
   laptop_id:=CASE WHEN n IN(6,9,10) THEN NULL ELSE laptop.id END; sale:=laptop.retail_price_vnd;
   result:=public.create_order_with_inventory(jsonb_strip_nulls(jsonb_build_object('created_date',ordered,'month_key',month,
    'laptop_id',laptop_id,'requested_laptop_id',CASE WHEN laptop_id IS NULL THEN laptop.id ELSE NULL END,'customer_id',customer.id,
    'customer_info',customer.name||' - '||customer.phone,'customer_address',customer.address,
    'sale_online',(1+(n-1)%8)::text,'sale_offline',(1+(n-1)%2)::text,'note','Đơn mẫu tháng '||month,
    'order_type','retail','order_status',order_status,'payment_status','unpaid','payment_method','transfer_cash',
    'delivery_status',CASE WHEN n<=4 THEN 'delivered' WHEN n=8 THEN 'shipped' ELSE 'at_store' END,
    'shipping_method',CASE WHEN n=8 THEN 'viettelpost' ELSE 'direct_store' END,'sale_price',sale,
    'amount_paid',0,'deposit_amount',0,'cod_amount',0,'ship_date',CASE WHEN n<=4 OR n=8 THEN ordered ELSE NULL END,
    'tracking_code',CASE WHEN n=8 THEN 'VTP-'||laptop.serial ELSE NULL END,
    'setup_note','Cài đặt Windows và kiểm tra máy','warranty','6 tháng',
    'cancel_reason',CASE WHEN n=10 THEN 'Khách đổi nhu cầu' ELSE NULL END,
    'cancelled_at',CASE WHEN n=10 THEN stamp ELSE NULL END,'is_active',true,'created_at',stamp,'updated_at',stamp)),'Seed');
   order_id:=(result->'order'->>'id')::bigint;
   IF n IN(5,6) THEN
    SELECT id INTO account FROM cash_accounts WHERE code='SEED_BANK';
    PERFORM record_order_payment_with_account(order_id,1,'deposit','transfer_cash',ordered,'SEED-'||m||'-'||n,
     'Tiền cọc','Seed',account,'seed-'||m||'-'||n||'-deposit');
   END IF;
  END LOOP;
 END LOOP;
END $$;

DO $$ BEGIN
 IF (SELECT count(*) FROM laptops)<>30 OR (SELECT count(*) FROM orders)<>20 THEN RAISE EXCEPTION 'Seed counts mismatch'; END IF;
 IF (SELECT count(*) FROM orders WHERE month_key='08/2026')<>10 OR (SELECT count(*) FROM orders WHERE month_key='09/2026')<>10 THEN RAISE EXCEPTION 'Monthly order distribution mismatch'; END IF;
 IF (SELECT count(*) FROM laptops WHERE month_key='08/2026')<>15 OR (SELECT count(*) FROM laptops WHERE month_key='09/2026')<>15 THEN RAISE EXCEPTION 'Monthly laptop distribution mismatch'; END IF;
 IF (SELECT count(*) FROM suppliers)<>16 OR (SELECT count(*) FROM purchase_batches)<>2 OR (SELECT count(*) FROM qc_inspections)<>30 OR (SELECT count(*) FROM app_options WHERE group_key='category' AND is_active)<>31 THEN RAISE EXCEPTION 'Catalog/procurement seed mismatch'; END IF;
 IF (SELECT (value->>'defaultRate')::numeric FROM app_settings WHERE key='formula')<>3990 OR EXISTS(SELECT 1 FROM laptops WHERE exchange_rate<>3990 OR purchase_exchange_rate<>3990) OR EXISTS(SELECT 1 FROM purchase_batches WHERE exchange_rate<>3990) THEN RAISE EXCEPTION 'Exchange rate mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM orders WHERE month_key<>to_char(created_date,'MM/YYYY')) THEN RAISE EXCEPTION 'Order month mismatch'; END IF;
END $$;
COMMIT;
SELECT month_key,count(*) laptops FROM laptops GROUP BY month_key ORDER BY month_key;
SELECT month_key,count(*) orders FROM orders GROUP BY month_key ORDER BY month_key;
