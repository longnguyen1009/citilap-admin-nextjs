-- Replace operational data with the 01/10/2026 Google Sheet snapshot.
-- Preserves users, suppliers, catalogs, settings, branches, cash accounts and accessories.
PRAGMA defer_foreign_keys = ON;

DELETE FROM trade_in_check_items;
DELETE FROM trade_in_inspections;
DELETE FROM trade_ins;
DELETE FROM cod_settlements;
DELETE FROM cod_receivables;
DELETE FROM commissions;
DELETE FROM account_reconciliations;
DELETE FROM account_transactions;
DELETE FROM financial_records;
DELETE FROM invoices;
DELETE FROM reservations;
DELETE FROM supplier_refunds;
DELETE FROM supplier_return_events;
DELETE FROM supplier_return_items;
DELETE FROM supplier_returns;
DELETE FROM repair_actions;
DELETE FROM repair_parts;
DELETE FROM repair_jobs;
DELETE FROM warranty_cases;
DELETE FROM qc_check_items;
DELETE FROM qc_inspections;
DELETE FROM stock_movements;
DELETE FROM payments;
DELETE FROM supplier_payments;
DELETE FROM laptop_cost_components;
DELETE FROM orders;
DELETE FROM laptops;
DELETE FROM purchase_batches;
DELETE FROM customers;
DELETE FROM operation_requests;
DELETE FROM activity_logs;

-- Make this snapshot migration reproducible from a blank database. Earlier
-- migrations only guarantee the two default Vietnamese sources, while this
-- snapshot references the full supplier catalog below. Preserve existing
-- supplier details on conflict and only ensure every required code is active.
INSERT INTO suppliers(
  code,name,display_name,wechat_name,country,preferred_shipping_destination,
  notes,active,created_by,created_at,updated_at
) VALUES
  ('RETAIL_BUYBACK','Thu lại khách lẻ','Thu lại khách lẻ','','Việt Nam','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_LENOVO_01','We-可一件代发','We-可一件代发','We-可一件代发','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('QUEANH','Quế Anh Mua','Quế Anh Mua','','Việt Nam','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WECHAT001','We-莫名','We-莫名','We-莫名','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('VN_TECH','Nhập thợ VN','Nhập thợ VN','','Việt Nam','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_A_BAC','We-A Bắc','We-A Bắc','We-A Bắc','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_MAO','We-Mão','We-Mão','We-Mão','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_LENOVO_02','We-AAALenovo','We-AAALenovo','We-AAALenovo','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_003','We-勇哥📱 13878190009','We-勇哥📱 13878190009','We-勇哥📱 13878190009','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_HUONG','We-Hướng','We-Hướng','We-Hướng','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_004','We-千百度（微信没回复及时打语音）','We-千百度（微信没回复及时打语音）','We-千百度（微信没回复及时打语音）','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_005','We-万法唯','We-万法唯','We-万法唯','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
  ('WE_MAXWELL','We-Maxwell','We-Maxwell','We-Maxwell','Trung Quốc','OTHER','Nguồn snapshot Google Sheet 01/10/2026',1,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')
ON CONFLICT(code) DO UPDATE SET
  active=1,
  updated_at=excluded.updated_at;

CREATE TABLE _sheet_suppliers(source_name TEXT PRIMARY KEY, supplier_code TEXT);
INSERT INTO _sheet_suppliers VALUES
  ('Thu lại khách lẻ', 'RETAIL_BUYBACK'),
  ('We-可一件代发', 'WE_LENOVO_01'),
  ('Quế Anh Mua', 'QUEANH'),
  ('We-莫名', 'WECHAT001'),
  ('Nhập thợ VN', 'VN_TECH'),
  ('We-A Bắc', 'WE_A_BAC'),
  ('We-Mão', 'WE_MAO'),
  ('We-AAALenovo', 'WE_LENOVO_02'),
  ('We-勇哥📱 13878190009', 'WE_003'),
  ('We-Hướng', 'WE_HUONG'),
  ('We-千百渡（微信没回复及时打语音）', 'WE_004'),
  ('We-万法唯', 'WE_005'),
  ('We-Maxwell', 'WE_MAXWELL');

CREATE TABLE _resolved_sheet_suppliers AS
SELECT m.source_name, (
  SELECT s.id FROM suppliers s
  WHERE (m.supplier_code IS NOT NULL AND s.code = m.supplier_code)
     OR trim(s.name) = m.source_name
     OR trim(s.display_name) = m.source_name
     OR trim(s.wechat_name) = m.source_name
  ORDER BY CASE WHEN m.supplier_code IS NOT NULL AND s.code = m.supplier_code THEN 0 ELSE 1 END
  LIMIT 1
) AS supplier_id
FROM _sheet_suppliers m;

-- NOT NULL makes the migration fail atomically if any registered supplier is missing.
CREATE TABLE _supplier_resolution_guard(source_name TEXT NOT NULL, supplier_id TEXT NOT NULL);
INSERT INTO _supplier_resolution_guard SELECT source_name, supplier_id FROM _resolved_sheet_suppliers;

CREATE TABLE _sheet_laptops(
  source_id INTEGER PRIMARY KEY, laptop_name TEXT NOT NULL, serial TEXT NOT NULL,
  category_key TEXT NOT NULL, supplier_name TEXT NOT NULL, supplier_code TEXT,
  arrival_state TEXT NOT NULL, sale_state TEXT NOT NULL, target_status TEXT NOT NULL,
  source_note TEXT NOT NULL, price_rmb NUMERIC NOT NULL, shipping_rmb NUMERIC NOT NULL,
  exchange_rate NUMERIC NOT NULL, import_price NUMERIC NOT NULL, tracking_code_cn TEXT NOT NULL
);
INSERT INTO _sheet_laptops VALUES
  (1260, 'Huawei Matebook 14 Ultra 5 125H/16/1T/màn 14" 2.8K 120Hz OLED màu bạc', '2VBB24A10800365', 'huawei', 'Thu lại khách lẻ', 'RETAIL_BUYBACK', 'Sẵn hàng', 'Chưa bán', 'available', 'Nhập lại mã từ T8 22/9', 0, 0, 3910, 18, ''),
  (1346, 'Legion 5 Pro 2025 R9000P R9-8945HX/16/1T/5060/2.5K 240Hz màu trắng', 'PF5HMAKN', 'legion_5_pro_25_26', 'We-可一件代发', 'WE_LENOVO_01', 'Sẵn hàng', 'Chưa bán', 'available', 'mã 5772(2), đuôi cấn nhẹ, ĐÃ NÂNG RAM 32GB,1/9 ok', 9200, 0, 3930, 36.56, 'SF5150945006303'),
  (1423, 'Legion 5 Pro 2021 R9000P R7-5800H/16/512/3070/2.5K 165Hz', '', 'legion_5_pro_21_22', 'Thu lại khách lẻ', 'RETAIL_BUYBACK', 'Sẵn hàng', 'Chưa bán', 'available', 'Thu lại khách, bật không lên', 0, 0, 3910, 17.5, ''),
  (1431, 'Dell 16 Plus DB16250 Ultra7-285V/32/1T/2.5k 120Hz', 'HY0HH94', 'dell', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', '1/9 ok22/9', 5000, 0, 3930, 20.05, 'JDK002031707507'),
  (1463, 'Honor MagicBook Pro 16 2024 Ultra5-125H/24/1T/4060/3K 165Hz màu tím', 'APAQBB4220800826', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Đã bán', 'Đã Bán', 'sold', 'Gaming 1/9 OK 22/9 THẮNG DÙNG', 5200, 0, 3930, 20.84, 'SF0210526368106'),
  (1472, 'Legion 5 Pro 2023 R9000P R7-7745HX/16GB/1TB/4060/2.5K 240Hz', '', 'legion_5_pro_23_24', 'Thu lại khách lẻ', 'RETAIL_BUYBACK', 'Sẵn hàng', 'Chưa bán', 'available', 'Thu lại của khách ngày 25/9', 0, 0, 3910, 25.5, ''),
  (1482, 'Legion 5 2023 R7000 R7-7840H/16GB/1TB/4060/FHD 144Hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'HỦY', 'HỦY', 'ignored', '', 5600, 0, 3915, 22.32, 'SF0213346473511'),
  (1484, 'Legion 5 Pro 2023 R9000P R9-7945HX/16GB/1TB/4060/2.5K 240Hz', 'PF4GHQEK', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A lõm xước màn đốm hằn phím', 6600, 0, 3915, 26.24, 'SF0211877065570'),
  (1509, 'Dell Precision 7750| i7-10850H| ram 16GB| ssd 512GB| RTX 4000| màn hình 17.3" 4K + dán mặt A', '', 'dell', 'Nhập thợ VN', 'VN_TECH', 'Đã bán', 'Đã Bán', 'sold', 'A xước,viền B nứt,đang kiểm tra 1/9', 0, 0, 3910, 16, ''),
  (1531, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz màu trắng', 'PF4ISN8K', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Đã bán', 'Đã Bán', 'sold', 'OK 22/9', 6700, 0, 3900, 26.53, 'SF0210877094922'),
  (1533, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'BH003946', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'DATE 2024,A xước nhẹ,ok 22/9', 6700, 0, 3900, 26.53, 'SF0210767350337'),
  (1557, 'Legion 5 Pro 2024 R9000P R9-7945HX/16GB/1TB/4060/2.5K 240Hz', 'PF56DJPK', 'legion_5_pro_23_24', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', 'A cấn nhẹ,xước nhẹ,ok', 7050, 0, 3900, 27.9, 'JDK004010986929'),
  (1560, 'Legion 5 Pro 2024 R9000P R9-7945HX/16GB/1TB/4060/2.5K 240Hz', '', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'HỦY', 'HỦY', 'ignored', '', 7000, 0, 3900, 27.7, 'SF0217296599213'),
  (1567, 'Honor Magicbook pro 14 2024 Ultra5 255H/32/1T/3K 120Hz  xanh bạc', 'A7YC9X5314000707', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước nặng', 4200, 0, 3900, 16.78, 'JDX057862328126'),
  (1570, 'MagicBoook Pro 16 2024 Ultra 5 125H/24/1T/4060/3K 165Hz tím', 'APAQBB4218800320', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 5380, 0, 3900, 21.38, 'JDX057935696051'),
  (1571, 'Honor Magicbook pro 14 2025 Ultra5 255H/32/1T/3K 120Hz xám bạc', 'A7YC8X5222000742', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', '', 4750, 0, 3900, 18.93, 'SF0213707308490'),
  (1572, 'Legion 5 Pro 2024 R9000P R9-7945HX/16GB/1TB/RTX 4060', 'BH00RERE', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'đốm sáng,OK 22/9', 7250, 0, 3905, 28.71, 'SF0215997076505'),
  (1573, 'Asus ROG Strix G16 2024 i9-14900HX/16/1T/4060/2.5K 240Hz', 'S5NRKD029655205', 'rog_strix_g16_g18', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', '', 6900, 0, 3905, 27.34, 'SF0218047178323'),
  (1576, 'Legion 5 2023 Y7000P i7-13620H/16GB/1TB/RTX 4060/2.5K 165Hz', 'MP2HMX51', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK 22/9', 6700, 0, 3905, 26.56, 'SF0218317286666'),
  (1578, 'Legion 5 2024 Y7000 i7-13650HX/24GB/512GB/RTX 4060/FHD 144Hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'Máy back lại, đã đổi cho khách con khác ( chập)', 6500, 0, 3905, 25.78, 'SF0210557415929'),
  (1581, 'Honor Magicbook pro 14 2025 Ultra5 225H/32/1T/3K 120Hz trắng, cảm ứng', 'PF5F3HD5', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 4900, 0, 3905, 19.53, 'SF0217068221198'),
  (1582, 'Honor Magicbook pro 16 2024 Ultra5 125H/24/1T/3K 120Hz tím', 'AQ2R9X5503001139', 'huawei', 'Nhập thợ VN', 'VN_TECH', 'Sẵn hàng', 'Chưa bán', 'available', 'viền C cong, đang gửi về TQ fix', 4100, 0, 3900, 16.39, 'SF1578407583388'),
  (1584, 'Legion 5 2024 R7000P R7-8845H/16/1T/4060/2.5K 165Hz', 'A72VBB4B06800453', 'legion_5_23_24', 'We-Mão', NULL, 'Sẵn hàng', 'Chưa bán', 'available', 'ok 22/9', 6700, 0, 3905, 26.56, 'SF1575051551985'),
  (1605, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'PF4L4YG8', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A xướt nhẹ,màn đốm,đã làm đốm,ok', 6400, 0, 3900, 25.36, 'SF0212787268780'),
  (1606, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'BH00SB45', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A cấn nhẹ,ok', 7250, 0, 3900, 28.68, 'SF0212647318100'),
  (1607, 'Legion 5 2023 R7000 R7-7840H/16/512/4060/FHD 144Hz', 'PF4V4NC0', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn 2K đã thay màn fhd 144hz ok 22/9,đã tháo màn bán', 6000, 0, 3900, 23.8, 'SF0211517495265'),
  (1609, 'Legion 5 2023 R7000P R7-7840H/16/1T/4060/2.5K 165Hz', 'MP2H1X4P', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn lỗi, A Lõm nhẹ,ok, 22/9', 6350, 0, 3900, 25.17, 'SF0216437338461'),
  (1610, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'PF53CTFQ', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 7250, 0, 3900, 28.68, 'SF0212957399119'),
  (1619, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T+1T/4060/2.5K 240Hz', 'PF4TE2FM', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'đã bóc ổ 1T, pin có vấn đề,đã đảo pin sang LO 1745,ok 25/9', 7700, 0, 3900, 30.43, 'SF0212987412425'),
  (1620, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'FP4E8ED1', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'máy cũ, đã đổi cho khách c khác, báo delay phím,đã thay phím ok A xước', 7100, 0, 3900, 28.09, 'SF0218797455656'),
  (1627, 'Legion 5 2024 Y7000 i7-13650HX/24/512/4060/FHD 144Hz', 'PF4X2SYA', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6600, 0, 3900, 26.14, '6114'),
  (1683, 'Magicbook pro 14 2025 Ultra5-225H/32/1T/3K 120Hz, xanh bạc k cảm ứng', 'A7YCJV6618100156', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', 'a lõm nặng 22/9', 4639, 0, 3920, 18.58, 'JDVB68618148501'),
  (1692, 'Legion 5 2023 R7000P R7-7840H/16/1T/4060/2.5K 165Hz', 'MP2H2PR7', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'màn đốm ố vàng hằn phím ok 22/9', 6400, 0, 3910, 25.42, ''),
  (1694, 'Legion 5 2023 R7000P R7-7840H/16/1T/4060/2.5K 165Hz', 'MP2GW9F9', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'test lại phím ,đã thay cụm C ok 22/9', 6400, 0, 3910, 25.42, ''),
  (1704, 'Legion 5 Pro 22 R9000P R7-6800H/16/512/3060/2.5K 165Hz', 'PF3SS8ZF', 'legion_5_pro_21_22', 'We-AAALenovo', 'WE_LENOVO_02', 'HỦY', 'HỦY', 'ignored', 'màn điểm chết C xước', 4700, 0, 3910, 18.78, ''),
  (1713, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'INVALID(vỏ PS001KHG)', 'legion_5_pro_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'màn lỗi, nạp bios,vào bios nháy màn, tạm thời test oke, màn LỖI 22/9', 6850, 0, 3910, 27.18, 'SF1221392955201'),
  (1732, 'Honor Magicbook Pro 16 2021 R7-5800H/16/512/3050/FHD 144Hz', 'AHYMBB1A20800720', 'huawei', 'Nhập thợ VN', 'VN_TECH', 'Sẵn hàng', 'Chưa bán', 'available', '', 2850, 0, 3910, 11.54, 'SF1578171974919'),
  (1733, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'BH00FFXC', 'legion_5_pro_23_24', 'Nhập thợ VN', 'VN_TECH', 'Sẵn hàng', 'Chưa bán', 'available', 'A, C cấn 22/9', 7200, 0, 3910, 28.55, 'SF1571750479175'),
  (1734, 'Legion 5 2024 Y7000P i7-14700HX/16/1T/4060/2.5K 165Hz', '', 'legion_5_23_24', 'Nhập thợ VN', 'VN_TECH', 'Sẵn hàng', 'Chưa bán', 'available', '', 7400, 0, 3910, 29.33, 'JDVA47075658719'),
  (1736, 'Legion 5 2023 R7000 R7-7840H/16GB/512GB/RTX 4060', 'PF4QNNPE', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn bụi, thiếu màn', 6100, 0, 3910, 24.25, 'SF0213777628168'),
  (1737, 'ASUS ROG Strix G16 2024 i9-14900HX/16GB/1TB/RTX 4060/2.5K 240hz', 'SBNRKD02578445C', 'rog_strix_g16_g18', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'BHH26/2/2028 OK 22/9', 8300, 0, 3910, 32.85, 'SF0213777694906'),
  (1740, 'Legion 5 Pro 2024 R9000P R9-7945HX/16GB/1TB/RTX 4060/2.5K 240Hz fullbox', 'BH00SJQ3', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'TEST KỸ OK', 7400, 0, 3910, 29.33, 'SF0217297708075'),
  (1745, 'Legion 5 Pro 2023 R9000P R9-7945HX/16GB/1TB/RTX 4060/2.5K 240Hz', 'PF4GJQ1M', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'đuôi c xước nặng,test cpu reset,màn lỗi pin lỗi cần trả lại', 6950, 0, 3910, 27.57, 'SF0210628337016'),
  (1748, 'Legion 5 2024 Y7000 i7-13650HX/24GB/1T/RTX 4060/FHD 144Hz', 'BH00BKQE', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ĐÃ BÓC Ổ 512GB,OK', 6950, 0, 3910, 27.57, 'SF0217477763497'),
  (1750, 'Legion 5 2024 Y7000 i7-13650HX/24GB/1TB/RTX 4060/FHD 144Hz', 'PF4WLYQJ', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ssd 512 x2, ĐÃ BÓC 1 Ổ 512GB,OK 22/9', 6950, 0, 3910, 27.57, 'SF0210277834442'),
  (1756, 'ASUS ROG Strix G16 2024 i9-14900HX/16GB/1TB/RTX 4060/2.5K 240hz', 'S8NRKD01877034D', 'rog_strix_g16_g18', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'BH hãng về', 8000, 0, 3910, 31.68, 'SF1226429795126'),
  (1769, 'Acer Neo 16 2024 i9-14900HX/16GB/1TB/RTX 4060/2.5K 240Hz', '', 'acer_neo_16_23_25', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 6900, 0, 3910, 27.38, 'SF0212818082733'),
  (1772, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'BH00J72Q', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước màn lỗi cần thay màn, đã đảo cụm LO 1745 ok', 7300, 0, 3910, 28.94, '2970'),
  (1773, 'Legion 5 Pro 2024 R9000P R9-7945HX/16GB/1TB/RTX 4060/2.5K 240Hz màu trắng', '', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Đã bán', 'Đã Bán', 'sold', '', 7750, 0, 3910, 30.7, 'SF0216788009262'),
  (1776, 'Honor Magicbook pro 14 2025 Ultra5 225H/32/1T/3K 120Hz trắng, cảm ứng', 'AQ2RJV5828100386', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', 'fullbox đẹp 22/9', 4900, 29, 3910, 19.67, 'SF1575920514913'),
  (1778, 'Honor Magicbook Pro 16 2024 Ultra5 125H/24/1T/16" 3K 165Hz màu trắng', 'A72VBB5C10800194', 'huawei', 'We-勇哥📱 13878190009', 'WE_003', 'Sẵn hàng', 'Chưa bán', 'available', 'OK 22/9', 4200, 0, 3910, 16.82, 'SF1576140024778'),
  (1779, 'Asus Zephyrus G16 2024 Ultra9 185H/32/1T/16" 2.5K 240Hz OLED', 'S4NRCX06J473182', 'asus_zephyrus_g14_g16', 'We-Hướng', 'WE_HUONG', 'Sẵn hàng', 'Chưa bán', 'available', '', 8300, 0, 3910, 32.85, 'JDK005833539318'),
  (1782, 'Xiaoxin Pro 16C 2025 Ultra 5-225H/16/512/16" 2.8K 120hz OLED', 'YX0FEBGJ', 'lenovo', 'We-千百渡（微信没回复及时打语音）', 'WE_004', 'Sẵn hàng', 'Chưa bán', 'available', '', 4800, 0, 3910, 19.17, 'JDX058600923306'),
  (1783, 'Asus ROG Strix G16 2023 i9-13980HX/16/1T/4060/2.5K 240Hz, bảo hành 11/2026', 'SẢNRKD007193440', 'rog_strix_g16_g18', 'Nhập thợ VN', 'VN_TECH', 'Sẵn hàng', 'Chưa bán', 'available', '', 7200, 0, 3910, 28.55, 'SF1571451903714'),
  (1784, 'Leigon 5 Pro 2022 Y9000P i7-12700H/16/512/3060/2.5K 165Hz màu trắng', 'PF3Y6PJ5', 'legion_5_pro_21_22', 'Nhập thợ VN', 'VN_TECH', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước nặng,ok', 5200, 0, 3910, 20.73, 'JDX058545362190'),
  (1785, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/2T/4060/2.5K 240Hz màu trắng', 'PF52CS74', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ĐÃ BÓC Ổ 1T,A xước cạnh,ok', 8350, 0, 3900, 32.97, 'SF0210638103309'),
  (1787, 'Legion 5 2024 Y7000 i7-13650HX/24GB/512/RTX 4060/FHD 144Hz', 'PF5CXC54', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn hằn phím,OK', 6500, 0, 3900, 25.75, '6603'),
  (1793, 'Acer Neo 16 2024 i9-14900HX/16GB/1TB/RTX 4060/2.5K 240Hz', '', 'acer_neo_16_23_25', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', '', 6900, 0, 3900, 27.31, 'SF0210898125386'),
  (1794, 'Legion 5 Pro 2023 Y9000P i9-13900HX/16/1T/4060/2.5K 240Hz màu trắng', 'PF4QC0AL', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'GPU ăn 125W cần test game,OK 22/9', 7600, 0, 3910, 30.12, 'SF1572648795219'),
  (1795, 'Asus ROG Strix G18 2024 i9-14900HX/16/1T/4060/2.5K 240Hz', 'S3NRKDCNR0UR134', 'rog_strix_g16_g18', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'ok 22/9', 8400, 0, 3910, 33.24, 'SF1572648795219'),
  (1796, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'BH00SK6M', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước viền nhẹ,ok 22/9', 7300, 0, 3910, 28.94, 'JDX058540794330'),
  (1797, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'PF57VNYR', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước nhẹ,ok', 7300, 0, 3910, 28.94, 'JDX058540794330'),
  (1798, 'Legion 5 Pro 2022 Y9000P i9-12900H/16/512/3060/2.5K 165hz màu trắng', '', 'legion_5_pro_21_22', 'We-A Bắc', 'WE_A_BAC', 'Đã bán', 'Đã Bán', 'sold', '', 5400, 0, 3910, 21.51, 'JDX058540794330'),
  (1799, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144hz', 'BH00SH4H', 'legion_5_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6300, 30, 3910, 25.15, 'SF0215798100637'),
  (1802, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'BH00QNPA', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'góc C trái móp nhẹ,ok 22/9', 7300, 30, 3910, 29.06, 'SF0216978129896'),
  (1807, 'Honor Magicbook Pro 16 2024 Ultra5 125H/24/1T/16" 3K 165Hz màu trắng', 'A72VBB4C07801032', 'huawei', 'We-Hướng', 'WE_HUONG', 'Sẵn hàng', 'Chưa bán', 'available', '', 4300, 0, 3905, 17.19, 'JDK005833539352'),
  (1810, 'Honor Magicbook pro 14 2025 Ultra5 225H/32/1T/3k 120Hz màu trắng, cảm ứng', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Đã bán', 'Đã Bán', 'sold', '', 4999, 0, 3905, 19.92, 'JDVB69004449696'),
  (1811, 'Honor Magicbook pro 14 2025 Ultra5 225H/32/1T/3k 120Hz xám bạc, k cảm ứng', 'A7YC9X5315000793', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', '22/9', 4699, 0, 3905, 18.75, 'JDVB69003464251'),
  (1814, 'Legion 5 2023 R7000 R7-7840H/16GB/512GB/RTX 4060', 'BH007LNR', 'legion_5_23_24', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', 'màn ố,ok', 6100, 0, 3905, 24.22, 'SF1226513786834'),
  (1815, 'Legion 5 2023 R7000 R7-7840H/16GB/512GB/RTX 4060', '', 'legion_5_23_24', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', '', 6100, 0, 3905, 24.22, 'SF5151969500481'),
  (1818, 'Honor Magicbook x14plus 2025 Core 5 220H/16/1T/2.8K 120Hz', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 3700, 0, 3905, 14.85, 'SF0217068221198'),
  (1828, 'Legion 5 2024 Y7000 i7-13650HX/24/512/4060/FHD 144Hz', 'PF52EGM1', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6500, 0, 3905, 25.78, '"0606'),
  (1829, 'Legion 5 2024 Y7000 i7-13650HX/24/512/4060/FHD 144Hz', 'BH00LBQF', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn kẻ đốm cần thay,A móp góc lõm nhẹ', 6500, 0, 3905, 25.78, 'SF0214588233194'),
  (1830, 'Legion 5 2023 R7000 R7-7840H/16/512/4060/FHD 144hz', 'PF4VAC3V', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn 2k lưu ảnh', 5900, 0, 3905, 23.44, 'SF0219108349288'),
  (1832, 'Legion 5 2023 R7000 R7-7735H/16/512/4060/2.5K 165Hz', 'PF4Q33EX', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn FHD 144Hz lỗi ram đã thay ram', 5800, 0, 3905, 23.05, 'SF0216445871502'),
  (1834, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', 'PF54L1B8', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6300, 0, 3905, 25, 'SF0214908226306'),
  (1835, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz màu trắng', 'PF576XFH', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước tp ố nhẹ,ok', 7750, 0, 3905, 30.66, '1303'),
  (1836, 'Legion 5 2024 Y7000P i7-14650HX/16/1T/4050/2.5K 165Hz', 'MP2J1N1M', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'MAIN CHẬP 22/9', 6500, 0, 3905, 25.78, 'SF0218448238652'),
  (1837, 'Legion 5 Pro 2023 Y9000P i9-13900HX/16/1T/4060/2.5K 240Hz màu trắng', 'PF4BL146', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'TP Ố C XƯỚC 22/9', 7700, 0, 3905, 30.47, 'SF0218168241725'),
  (1839, 'Legion 5 2023 R7000 R7-7840H/16/512/4060/FHD 144hz', 'PF4TS92S', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A lõm nặng màn đốm', 5900, 0, 3905, 23.44, 'SF0212318313206'),
  (1840, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz màu trắng', 'PF570418', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước,ok', 7750, 0, 3905, 30.66, 'SF0219978211070'),
  (1842, 'Xiaoxin Pro 16 2024 Ultra 5-125H/16/512/16" 2K 120hz OLED', 'MP2Q5K1W', 'lenovo', 'Nhập thợ VN', 'VN_TECH', 'Sẵn hàng', 'Chưa bán', 'available', 'SLIM 5', 4050, 0, 3910, 16.24, 'JDVA47303244079'),
  (1844, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', 'PF5AXS8G', 'legion_5_pro_23_24', 'We-千百渡（微信没回复及时打语音）', 'WE_004', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 7200, 0, 3910, 28.55, '5274'),
  (1845, 'Xiaoxin Pro 16C 2025 Ultra 5-225H/16/1T/16" 2.8K 120hz OLED', '', 'lenovo', 'We-千百渡（微信没回复及时打语音）', 'WE_004', 'Sẵn hàng', 'Chưa bán', 'available', '', 4900, 0, 3910, 19.56, '5274'),
  (1846, 'Legion 5 2023 Y7000P i7-13620H/16/1T/4060/2.5K 165hz', 'MPALY340', 'legion_5_23_24', 'We-万法唯', 'WE_005', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6300, 0, 3910, 25.03, 'SF1571750479872'),
  (1847, 'Xiaoxin Pro 16C 2025 Ultra 5-225H/16/1T/16" 2.8K 120hz OLED', 'YX0H5105', 'lenovo', 'We-Hướng', 'WE_HUONG', 'Sẵn hàng', 'Chưa bán', 'available', '', 5100, 0, 3910, 20.34, 'JDK005833539408'),
  (1848, 'Honor Magicbook Pro 16 2024 Ultra7 155H/32/1T/4060/3K 165Hz trắng', 'A5XCBB4719800782', 'huawei', 'We-Hướng', 'WE_HUONG', 'Sẵn hàng', 'Chưa bán', 'available', '', 6300, 0, 3910, 25.03, 'JDK005833539425'),
  (1849, 'Legion 5 Pro 2023 Y9000P i9-13900HX/16/1T/4060/2.5K 240Hz màu trắng', 'PS0000JQW', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'C cháy,ok', 7600, 43, 3910, 30.28, 'SF0210758385499'),
  (1850, 'Legion 5 Pro 2023 Y9000P i9-13900HX/16/1T/4060/2.5K 240Hz màu trắng', 'PF4K8YSS', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'màn nhiều điểm chết', 7600, 34, 3910, 30.25, 'SF1572648795316'),
  (1851, 'Legion 5 Pro 2023 Y9000P i9-13900HX/16/1T/4060/2.5K 240Hz màu trắng', 'PF4KJSHD', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'C ố nhẹ,ok', 7600, 34, 3910, 30.25, 'SF1572648795316'),
  (1852, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'BH00HN7J', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước,ok', 7300, 40, 3910, 29.1, 'SF1572648795403'),
  (1853, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'BH00LPAH', 'legion_5_pro_23_24', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước nhẹ', 7200, 40, 3910, 28.71, 'SF1581370494270'),
  (1854, 'Legion 5 2023 R7000 R7-7840H/16/512/4060/FHD 144hz', 'PF4STEAJ', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ok', 5900, 0, 3910, 23.47, 'SF0210558342869'),
  (1855, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'PF4PXSZR', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6900, 0, 3910, 27.38, 'SF0216978487564'),
  (1858, 'Legion 5 2023 R7000 R7-7840H/16/1T/4060/FHD 144hz', 'PF4TGYWJ', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'đã bóc ổ 512gb,màn hằn,A móp,ok', 6250, 0, 3910, 24.84, 'SF0219348414542'),
  (1860, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'BH013D2A', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 7300, 0, 3910, 28.94, 'SF0218908702944'),
  (1861, 'Legion 5 Pro 2023 Y9000P i9-13900HX/16/1T/4060/2.5K 240Hz', 'PF4DR0YE', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn hằn,ok', 7400, 0, 3910, 29.33, 'SF0215778483947'),
  (1862, 'Legion 5 2023 R7000P R7-7840H/16GB/1T/RTX 4060/2.5K 165Hz', 'MP2FZYDP', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6400, 0, 3910, 25.42, 'SF0213768790082'),
  (1863, 'Legion 5 2024 Y7000 i7-13650HX/24/1T/4060/FHD 144Hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Đã bán', 'Đã Bán', 'sold', '', 6850, 0, 3910, 27.18, 'SF0215958468289'),
  (1864, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'PF582CL1', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 7300, 0, 3910, 28.94, 'SF0217588531092'),
  (1865, 'Acer Neo 16 2024 i9-14900HX/16/1T/4060/2.5K 240Hz', 'NHQNNCN0094170593A3400', 'acer_neo_16_23_25', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A lõm cong màn hằn đã làm hằn, xước viền,ok', 6900, 0, 3910, 27.38, 'SF0214408669938'),
  (1866, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'PF4GLR3M', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước nhẹ,ok', 6900, 0, 3910, 27.38, 'SF0217778767943'),
  (1867, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'PF523SBV', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6900, 0, 3910, 27.38, ''),
  (1868, 'Legion 5 2023 R7000 R7-7840H/16/512/4060/FHD 144hz', 'PF4T704G', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ko màn', 5900, 0, 3910, 23.47, 'SF0210718859637'),
  (1869, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'PF56DYY3', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 7300, 0, 3910, 28.94, 'SF0219318692517'),
  (1870, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'BH00KB6F', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 7300, 0, 3910, 28.94, 'SF0215558658510'),
  (1871, 'Legion 5 2024 Y7000 i7-13650HX/24/512/4060/FHD 144Hz', 'PF5FA53A', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6500, 0, 3910, 25.82, 'SF0215578640665'),
  (1872, 'Acer Neo 16 2024 i9-14900HX/16/1T/4060/2.5K 240Hz', '', 'acer_neo_16_23_25', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'khách ở HCM bỏ cọc, hàng vẫn ở HCM', 6900, 0, 3910, 27.38, 'SF0218518630547'),
  (1874, 'Acer Nitro 5 Tiger 2022 i5-12500H/16GB/512GB/RTX 3050Ti/FHD 165hz', '', 'acer_nitro_5_21_22', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 3150, 0, 3910, 12.72, 'SF0211839013699'),
  (1875, 'ASUS ROG Strix G16 2024 i9-14900HX/16GB/1TB/RTX 4060/2.5K 240hz', 'S5NRKD026178218', 'rog_strix_g16_g18', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', '', 8000, 0, 3910, 31.68, 'SF0214288640183'),
  (1877, 'ASUS ROG Strix G16 2024 i9-14900HX/16GB/1TB/RTX 4060/2.5K 240hz', 'S4NRKD054751178', 'rog_strix_g16_g18', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước', 7900, 0, 3910, 31.29, 'SF0211518892393'),
  (1878, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4070/2.5K 240hz màu trắng', 'PF56EA48', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 7900, 0, 3910, 31.29, 'SF0217028848395'),
  (1879, 'Legion 5 2023 R7000 R7-7840H/16/512/4060/FHD 144hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', '', 5900, 0, 3910, 23.47, 'SF0218498673870'),
  (1880, 'Legion 5 2024 Y7000 i7-13650HX/24/1T/4060/FHD 144Hz', 'BH010ESW', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ĐÃ BÓC 1 Ổ 512GB,OK', 6850, 0, 3910, 27.18, 'SF0211128752669'),
  (1882, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz màu trắng', 'PF576XEH', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'góc A trái cấn thiếu 1 ốc D test kỹ ok 25/9', 7650, 0, 3910, 30.31, 'SF0213138707959'),
  (1883, 'Legion 5 Pro 2023 Y9000P i9-13900HX/16/1T/4060/2.5K 240Hz', 'PF4AFGWY', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'TEST KỸ MÀN HẰN NHẸ,OK', 7300, 0, 3910, 28.94, 'SF0217878739620'),
  (1884, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz', 'PF56DTXW', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'quạt trái kêu,ok', 7200, 0, 3910, 28.55, 'SF0254688972701'),
  (1885, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz màu trắng', 'PF0045RV', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ok', 7650, 0, 3910, 30.31, 'SF0253738984706'),
  (1886, 'Legion 5 Pro 2024 R9000P R9-7945HX/16/1T/4060/2.5K 240hz màu trắng', 'BH00FLQY', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'ok', 7650, 0, 3910, 30.31, 'SF0252968985777'),
  (1887, 'Legion 5 2024 Y7000 i7-13650HX/24/512/4060/FHD 144Hz', 'BH014BJ5', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'màn xước,ok', 6400, 0, 3910, 25.42, 'SF0256458690722'),
  (1888, 'Legion 5 2024 Y7000 i7-13650HX/24/512/4060/FHD 144Hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', '', 6400, 0, 3910, 25.42, '1034'),
  (1890, 'Legion 5 2022 R7-6800H/16/512/3050ti/2.5K 165Hz', 'PF3T7E3B', 'legion_5_21_22', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'màn lỗi cần thay màn', 4000, 0, 3910, 16.04, 'SF5151395363774'),
  (1894, 'Legion 5 2022 R7-6800H/16/512/3050/2.5K 165Hz', 'PF44WCTD', 'legion_5_21_22', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'A xước đã làm màn ok,ok', 3800, 0, 3910, 15.26, 'SF5151395363774'),
  (1895, 'Legion 5 2022 R7-6800H/16/512/3050/2.5K 165Hz', 'PF4526BF', 'legion_5_21_22', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'màn điểm chết to', 3800, 0, 3910, 15.26, 'SF5151395363774'),
  (1896, 'Legion 5 2022 R7-6800H/16/512/3050/2.5K 165Hz', '', 'legion_5_21_22', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', '', 3800, 0, 3910, 15.26, 'SF5151395363774'),
  (1913, 'Legion 5 2023 R7000 R7-7735H/16/512/4060/2.5K 165Hz', 'PF4PW60Q', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Đã bán', 'Đã Bán', 'sold', 'A xước,ok', 5800, 0, 3910, 23.08, 'SF5151395363774'),
  (1918, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', 'PF56M7NC', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6200, 0, 3910, 24.64, 'SF5151395363774'),
  (1919, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', '', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', '', 6200, 0, 3910, 24.64, 'SF5151395363774'),
  (1921, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', 'FP52XM90', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'lúc lên lúc ko, cần test lại đã thay ram ổ ko đc cần trả lại', 6200, 0, 3910, 24.64, 'SF5151395363774'),
  (1922, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', 'PF56SE9Y', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'màn điểm bụi bán off', 6200, 0, 3910, 24.64, 'SF5151395363774'),
  (1924, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', 'PF52NR7', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'màn điểm bụi,ok bán off', 6200, 0, 3910, 24.64, 'SF5153704009127'),
  (1925, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', 'PF56SS0C', 'legion_5_23_24', 'We-AAALenovo', 'WE_LENOVO_02', 'Sẵn hàng', 'Chưa bán', 'available', 'Màn điểm chết bán off', 6200, 0, 3910, 24.64, 'SF5153704009127'),
  (1931, 'Honor Magicbook pro 16 2025 Ultra5 225H/32/1T/3K 120Hz xám, k cảm ứng', 'A7YC9X5318000848', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', '', 4950, 0, 3910, 19.75, 'SF0215628878618'),
  (1932, 'ROG Zephyrus G15 GU502 R7-350H/16/512/1660ti/FHD 120hz', '', 'asus_zephyrus_g14_g16', 'Thu lại khách lẻ', 'RETAIL_BUYBACK', 'Sẵn hàng', 'Chưa bán', 'available', '10-12tr, ngoại hình xấu', 0, 0, 3910, 3, ''),
  (1933, 'Nitro 5 2022 i5-12500H/16/512/3050ti/FHD 165Hz', 'NHQSKCN00121602F9D3400', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 3050, 0, 3910, 12.33, 'SF0211508941392'),
  (1935, 'Nitro 5 2022 i5-12500H/16/512/3050ti/FHD 165Hz', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 2950, 0, 3910, 11.93, 'DPK202823802706'),
  (1936, 'Nitro 5 2022 i5-12500H/16/512/3050/FHD 165Hz', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 2900, 0, 3910, 11.74, ''),
  (1938, 'Nitro 5 2022 i5-12500H/16/512/3060/FHD 165Hz', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 3499, 0, 3910, 14.08, '8163796557411'),
  (1939, 'Nitro 5 2022 i5-12500H/16/512/3050/FHD 165Hz vỡ gáy', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 2870, 0, 3910, 11.62, 'SF0212399043066'),
  (1940, 'Honor MagicBook Art 14 2024 Ultr5 125H/32/1T/3K 120Hz màu trắng', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 4700, 0, 3910, 18.78, 'SF0210419128447'),
  (1941, 'Honor MagicBook Art 14 2024 Ultr5 155H/32/1T/3K 120Hz màu trắng', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 5100, 0, 3910, 20.34, ''),
  (1942, 'Honor MagicBook Art 14 2024 Ultr5 155H/32/1T/3K 120Hz màu xanh', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 5100, 0, 3910, 20.34, ''),
  (1943, 'Honor MagicBook Art 14 2024 Ultr5 155H/32/1T/3K 120Hz màu trắng, máy đẹp', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 5150, 0, 3910, 20.54, ''),
  (1944, 'Asus ROG Strix G17 2022 R9-6900HX/16/1T/3070ti/17" 2.5K 240Hz', '', 'rog_strix_g16_g18', 'Thu lại khách lẻ', 'RETAIL_BUYBACK', 'Sẵn hàng', 'Chưa bán', 'available', '', 0, 0, 3910, 20.6, ''),
  (1945, 'Legion 5 pro 2025 R9000P R9-8945HX/32/1T/5060/2.5K 240Hz', '', 'legion_5_pro_25_26', 'We-Maxwell', 'WE_MAXWELL', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 10000, 0, 3910, 39.5, 'SF1577203321879'),
  (1946, 'Legion 5 Pro 2022 R9000P R7-6800H/16/1T/3060/2.5K 165Hz', '', 'legion_5_pro_21_22', 'We-Hướng', 'WE_HUONG', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 5100, 0, 3910, 20.34, 'JDK005833539605'),
  (1947, 'Legion 5 Pro 2022 R9000P R7-6800H/16/1T/3060/2.5K 165Hz', '', 'legion_5_pro_21_22', 'We-Hướng', 'WE_HUONG', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 5000, 0, 3910, 19.95, 'JDK005833539605'),
  (1948, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', '', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 6800, 0, 3910, 26.99, '3516'),
  (1949, 'Legion 5 Pro 2023 R9000P R9-7945HX/16/1T/4060/2.5K 240Hz', '', 'legion_5_pro_23_24', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 6800, 0, 3910, 26.99, '8394'),
  (1951, 'Legion 5 2024 Y7000 i7-13650HX/24/1T/4060/FHD 144Hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 6400, 0, 3910, 25.42, '1472'),
  (1952, 'Legion 5 2024 R7000 R7-8745H/16/512/4060/FHD 144Hz', 'BH00RG85', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Sẵn hàng', 'Chưa bán', 'available', 'OK', 6200, 0, 3910, 24.64, '4407'),
  (1953, 'Legion 5 2023 R7000 R7-7735H/16/512/4060/2.5K 165Hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 5800, 0, 3910, 23.08, '3508'),
  (1954, 'Legion 5 2023 R7000 R7-7735H/16/512/4060/2.5K 165Hz', '', 'legion_5_23_24', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 5800, 0, 3910, 23.08, '5586'),
  (1955, 'Acer Neo 16 2024 i9-14900HX/16/1T/4060/2.5K 240Hz', 'NHQNNCN009423109273400', 'acer_neo_16_23_25', 'We-A Bắc', 'WE_A_BAC', 'Sẵn hàng', 'Chưa bán', 'available', 'ok', 6700, 50, 3910, 26.79, 'SF0214278893058'),
  (1956, 'Acer Nitro 5 Tiger i5-12500H/16/512/3060/FHD 165Hz', '', 'acer_nitro_5_21_22', 'We-A Bắc', 'WE_A_BAC', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 3500, 0, 3910, 14.09, ''),
  (1957, 'Acer Neo 16 2024 i9-14900HX/16/1T/4060/2.5K 240Hz', '', 'acer_neo_16_23_25', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 6700, 0, 3910, 26.6, ''),
  (1958, 'Acer Neo 16 2024 i9-14900HX/16/1T/4060/2.5K 240Hz', '', 'acer_neo_16_23_25', 'We-莫名', 'WECHAT001', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 6700, 0, 3910, 26.6, ''),
  (1959, 'Honor Magicbook pro 14 2025 Ultra5-225H/32/1T/3K 120Hz xám bạc', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 4760, 0, 3910, 19.01, ''),
  (1960, 'Honor Magicbook pro 14 2025 Ultra5-225H/32/1T/3K 120Hz trắng', '', 'huawei', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 4600, 0, 3910, 18.39, ''),
  (1961, 'Acer Nitro 5 2022 R7-6800H/16/512/3060/FHD 165Hz', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 3550, 0, 3910, 14.28, 'DPK202826822100'),
  (1962, 'Acer Nitro 5 2022 R7-6800H/16/512/3050ti/FHD 165Hz', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 3000, 0, 3910, 12.13, 'DPK202826822100'),
  (1963, 'Acer Nitro 5 Tiger 2022  i5-12500H/16/512/3050/FHD 165Hz', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 2900, 0, 3910, 11.74, 'DPK202827405143'),
  (1964, 'Legion 5 Pro 2021 R7-5800H/16/512/3060/2.5K 165Hz', '', 'legion_5_pro_21_22', 'Thu lại khách lẻ', 'RETAIL_BUYBACK', 'Sẵn hàng', 'Chưa bán', 'available', 'Thu lại khách lẻ, bật ko lên, đang sửa', 0, 0, 3910, 11, ''),
  (1965, 'Legion 5 Pro 2022 i7-12700H/16/512/3060/2.5K 165Hz', '', 'legion_5_23_24', 'Thu lại khách lẻ', 'RETAIL_BUYBACK', 'Sẵn hàng', 'Chưa bán', 'available', '', 0, 0, 3910, 21.5, ''),
  (1966, 'Acer Nitro 5 Tiger 2022  i5-12500H/16/512/3050/FHD 165Hz', '', 'acer_nitro_5_21_22', 'Quế Anh Mua', 'QUEANH', 'Chưa về hàng', 'Chưa bán', 'in_transit', '', 3000, 0, 3910, 12.13, '');

CREATE TABLE _sheet_orders(
  source_order_id INTEGER PRIMARY KEY, laptop_id INTEGER NOT NULL, shipping_method TEXT NOT NULL,
  order_status TEXT NOT NULL, payment_status TEXT NOT NULL, delivery_status TEXT NOT NULL,
  sale_price NUMERIC NOT NULL, deposit_amount NUMERIC NOT NULL, collect_amount NUMERIC NOT NULL,
  setup_note TEXT NOT NULL, warranty TEXT NOT NULL, has_gifts INTEGER NOT NULL,
  customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_address TEXT NOT NULL,
  inferred_payment INTEGER NOT NULL
);
INSERT INTO _sheet_orders VALUES
  (1, 1463, 'direct_ship', 'done', 'paid', 'delivered', 28.3, 0.5, 27.8, 'Cài cơ bản', '3 tháng', 1, 'A Văn', '0765528491', 'Gia Lâm', 0),
  (2, 1509, 'direct_store', 'done', 'paid', 'at_store', 20, 0.5, 19.5, 'Cài cơ bản', '3 tháng', 1, 'Nguyễn Văn Trường', '0385122183', 'Trực tiếp', 0),
  (3, 1531, 'direct_store', 'done', 'paid', 'at_store', 34.6, 0, 34.6, 'Cài cơ bản', '3 tháng', 0, 'Nguyễn Hồng Sơn', '0984318426', 'Trực tiếp', 0),
  (4, 1773, 'hcm_agent', 'shipping', 'cod', 'shipped', 35.8, 0.5, 35.3, 'Cài cơ bản', '3 tháng', 1, 'Lưu Hữu Lộc', '0333537623', 'Đối tác HCM: 480/15 Nguyễn Tri Phương, Phường 09, Phường Vườn Lài, TP Hồ Chí Minh', 0),
  (5, 1798, 'direct_store', 'done', 'paid', 'at_store', 28, 0, 28, 'Cài cơ bản', '3 tháng', 1, 'Nguyễn Thanh Sơn', '0868102008', 'Trực tiếp', 0),
  (6, 1810, 'hcm_agent', 'shipping', 'cod', 'shipped', 23.5, 0, 23.5, 'Cài cơ bản', '3 tháng', 1, 'Tuấn Cảnh', '0934152614', 'Đối tác HCM: 480/15 Nguyễn Tri Phương, Phường 09, Phường Vườn Lài, TP Hồ Chí Minh', 0),
  (7, 1863, 'direct_store', 'done', 'paid', 'at_store', 31.5, 0, 31.5, 'Cài cơ bản', '3 tháng', 1, 'Ngọc', '0866848910', '', 0),
  (8, 1913, 'shared_car', 'done', 'paid', 'delivered', 29.5, 1, 28.5, 'Cài cơ bản', '3 tháng', 1, 'Đặng Hùng Vĩ', '0386639619', 'Bên xe Thái Nguyên - https://maps.app.goo.gl/JfpJpkXcPR9Y1aqH7', 0);

CREATE TABLE _sheet_payments(
  source_payment_id INTEGER PRIMARY KEY, source_order_id INTEGER NOT NULL,
  payment_type TEXT NOT NULL, amount NUMERIC NOT NULL, note TEXT NOT NULL
);
INSERT INTO _sheet_payments VALUES
  (1, 1, 'deposit', 0.5, 'Tiền cọc theo Google Sheet'),
  (2, 1, 'cod', 27.8, 'Khoản thu hộ đã hoàn thành theo Google Sheet'),
  (3, 2, 'deposit', 0.5, 'Tiền cọc theo Google Sheet'),
  (4, 2, 'cod', 19.5, 'Khoản thu hộ đã hoàn thành theo Google Sheet'),
  (5, 3, 'cod', 34.6, 'Khoản thu hộ đã hoàn thành theo Google Sheet'),
  (6, 4, 'deposit', 0.5, 'Tiền cọc theo Google Sheet'),
  (7, 5, 'cod', 28, 'Khoản thu hộ đã hoàn thành theo Google Sheet'),
  (8, 7, 'cod', 31.5, 'Khoản thu hộ đã hoàn thành theo Google Sheet'),
  (9, 8, 'deposit', 1, 'Tiền cọc theo Google Sheet'),
  (10, 8, 'cod', 28.5, 'Khoản thu hộ đã hoàn thành theo Google Sheet');

INSERT INTO purchase_batches(
  batch_code,supplier_id,purchase_date,currency,exchange_rate,subtotal_rmb,domestic_shipping_rmb,
  other_cost_rmb,destination,status,notes,active,created_by,updated_by,idempotency_key,
  procurement_flow,created_at,updated_at
)
SELECT 'GS-20261001-'||s.code,s.id,'2026-10-01','CNY',ROUND(AVG(r.exchange_rate)),
  SUM(CASE WHEN r.target_status='ignored' THEN 0 ELSE r.price_rmb END),
  SUM(CASE WHEN r.target_status='ignored' THEN 0 ELSE r.shipping_rmb END),0,
  COALESCE(NULLIF(s.preferred_shipping_destination,''),'OTHER'),
  CASE
    WHEN SUM(r.target_status='in_transit')=0 THEN 'RECEIVED'
    WHEN SUM(r.target_status IN ('available','sold'))=0 THEN 'IN_TRANSIT_VN'
    ELSE 'PARTIALLY_RECEIVED'
  END,
  'Một lô theo nhà cung cấp, chuyển từ Google Sheet ngày 01/10/2026',1,
  'SYSTEM_MIGRATION','SYSTEM_MIGRATION','google-sheet-20261001-'||lower(s.code),'DIRECT',
  '2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'
FROM _sheet_laptops r
JOIN _resolved_sheet_suppliers rs ON rs.source_name=r.supplier_name
JOIN suppliers s ON s.id=rs.supplier_id
GROUP BY s.id,s.code,s.preferred_shipping_destination;

INSERT INTO laptops(
  id,serial,name,category,import_date,warehouse_date,location,charger_status,status,
  price_rmb,shipping_rmb,exchange_rate,import_price_vnd,tracking_code,customer_note,seller,
  is_active,month_key,created_at,updated_at,available_for_sale_at,source_type,source_reference_id,
  purchase_batch_id,tracking_code_cn,purchase_price_rmb,purchase_exchange_rate,received_at,sold_at,
  ignored_at,ignored_by,ignore_reason,created_by,qc_details,screen_status,camera_mic_status,
  mainboard_status,condition_note
)
SELECT r.source_id,NULLIF(r.serial,''),r.laptop_name,r.category_key,'2026-10-01',
  CASE WHEN r.target_status IN ('available','sold') THEN '2026-10-01' END,
  CASE WHEN r.target_status IN ('available','sold') THEN 'store' ELSE 'other' END,
  CASE WHEN r.target_status IN ('available','sold') THEN 'with_charger' ELSE 'unchecked' END,
  r.target_status,r.price_rmb,r.shipping_rmb,r.exchange_rate,r.import_price,r.tracking_code_cn,
  'Google Sheet ID '||r.source_id||char(10)||'Trạng thái nguồn: '||r.arrival_state||char(10)||'Tình trạng bán: '||r.sale_state,
  r.supplier_name,1,'10/2026','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z',
  CASE WHEN r.target_status IN ('available','sold') THEN '2026-10-01T00:00:00.000Z' END,
  'SUPPLIER_PURCHASE','GOOGLE_SHEET:'||r.source_id,b.id,r.tracking_code_cn,r.price_rmb,r.exchange_rate,
  CASE WHEN r.target_status IN ('available','sold') THEN '2026-10-01T00:00:00.000Z' END,
  CASE WHEN r.target_status='sold' THEN '2026-10-01T00:00:00.000Z' END,
  CASE WHEN r.target_status='ignored' THEN '2026-10-01T00:00:00.000Z' END,
  CASE WHEN r.target_status='ignored' THEN 'SYSTEM_MIGRATION' END,
  CASE WHEN r.target_status='ignored' THEN 'Trạng thái Google Sheet: HỦY' ELSE '' END,
  'SYSTEM_MIGRATION',
  CASE WHEN r.target_status IN ('available','sold') THEN '{"model":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"cpu":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"gpu":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"ram":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"ssd":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"mainboard":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"screen":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"keyboard":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"keyboard_backlight":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"touchpad":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"camera":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"microphone":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"speaker":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"wifi":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"bluetooth":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"usb":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"usb_c":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"hdmi":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"lan":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"battery":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"ssd_health":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"fan":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"cooling":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"cpu_stress":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"gpu_stress":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"charger":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"exterior":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"}}' ELSE '{}' END,
  CASE WHEN r.target_status IN ('available','sold') THEN 'ok' END,
  CASE WHEN r.target_status IN ('available','sold') THEN 'ok' END,
  CASE WHEN r.target_status IN ('available','sold') THEN 'ok' END,
  r.source_note
FROM _sheet_laptops r
JOIN _resolved_sheet_suppliers rs ON rs.source_name=r.supplier_name
JOIN suppliers s ON s.id=rs.supplier_id
JOIN purchase_batches b ON b.supplier_id=s.id AND b.batch_code='GS-20261001-'||s.code;

INSERT INTO qc_inspections(
  id,inspection_code,laptop_id,status,result,started_by,started_at,completed_by,completed_at,
  overall_notes,mainboard_status,charger_status,cosmetic_grade,idempotency_key,created_at,updated_at,
  completion_idempotency_key,disposition,detail_snapshot
)
SELECT 'sheet-qc-'||source_id,'QC-20261001-'||printf('%04d',source_id),source_id,'COMPLETED','PASS',
  'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z',
  'QC PASS toàn bộ theo snapshot Google Sheet','ORIGINAL','ORIGINAL','A','sheet-qc-start-'||source_id,
  '2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','sheet-qc-pass-'||source_id,'PASS',
  '{"model":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"cpu":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"gpu":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"ram":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"ssd":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"mainboard":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"screen":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"keyboard":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"keyboard_backlight":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"touchpad":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"camera":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"microphone":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"speaker":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"wifi":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"bluetooth":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"usb":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"usb_c":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"hdmi":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"lan":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"battery":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"ssd_health":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"fan":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"cooling":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"cpu_stress":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"gpu_stress":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"charger":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"},"exterior":{"result":"PASS","note":"Đạt theo snapshot Google Sheet 01/10/2026"}}'
FROM _sheet_laptops WHERE target_status IN ('available','sold');

INSERT INTO customers(id,name,phone,address,created_at,updated_at)
SELECT source_order_id,customer_name,customer_phone,customer_address,
  '2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'
FROM _sheet_orders;

INSERT INTO orders(
  id,created_date,note,order_type,order_status,payment_status,payment_method,delivery_status,
  shipping_method,laptop_id,requested_laptop_id,sale_price,deposit_amount,deposit_note,cod_amount,
  amount_paid,debt_amount,profit_vnd,customer_id,customer_info,customer_address,ship_date,setup_note,
  warranty,laptop_locked,month_key,is_active,created_at,updated_at,gift_accessory_ids,gift_preset,
  cost_snapshot_vnd,gross_profit_snapshot_vnd,direct_cost_snapshot_vnd,net_contribution_snapshot_vnd,
  cost_snapshot_status,cost_snapshot_reasons,cost_snapshotted_at
)
SELECT o.source_order_id,'2026-10-01',
  'Chuyển từ Google Sheet ngày 01/10/2026',
  'retail',o.order_status,o.payment_status,'transfer_cash',o.delivery_status,o.shipping_method,
  o.laptop_id,o.laptop_id,o.sale_price,o.deposit_amount,
  CASE WHEN o.deposit_amount>0 THEN 'Tiền cọc theo Google Sheet' ELSE '' END,
  o.collect_amount,
  CASE WHEN o.payment_status='paid' THEN o.sale_price ELSE o.deposit_amount END,
  CASE WHEN o.payment_status='paid' THEN 0 ELSE o.sale_price-o.deposit_amount END,
  ROUND(o.sale_price-l.import_price_vnd,4),o.source_order_id,o.customer_name||' '||o.customer_phone,
  o.customer_address,'2026-10-01',o.setup_note,o.warranty,1,'10/2026',1,
  '2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z',
  CASE WHEN o.has_gifts=1 THEN (SELECT json_group_array(id) FROM accessories WHERE sku IN ('PK-BAG','PK-MOUSE','PK-PAD')) ELSE '[]' END,
  CASE WHEN o.has_gifts=1 THEN 'custom' ELSE 'none' END,
  ROUND(l.import_price_vnd*1000000,0),ROUND((o.sale_price-l.import_price_vnd)*1000000,0),0,
  ROUND((o.sale_price-l.import_price_vnd)*1000000,0),'COMPLETE','[]','2026-10-01T00:00:00.000Z'
FROM _sheet_orders o JOIN laptops l ON l.id=o.laptop_id;

INSERT INTO payments(
  id,order_id,payment_type,amount,payment_method,payment_date,reference_code,note,recorded_by,created_at,idempotency_key
)
SELECT source_payment_id,source_order_id,payment_type,amount,
  CASE WHEN payment_type='cod' THEN 'cod' ELSE 'transfer_cash' END,
  '2026-10-01','GS-20261001-'||source_order_id||'-'||source_payment_id,note,'SYSTEM_MIGRATION',
  '2026-10-01T00:00:00.000Z','sheet-payment-'||source_payment_id
FROM _sheet_payments;

INSERT INTO financial_records(
  record_type,category,amount,order_id,payment_id,laptop_id,occurred_on,payment_method,note,recorded_by,created_at
)
SELECT 'income',p.payment_type,p.amount,p.order_id,p.id,o.laptop_id,p.payment_date,p.payment_method,p.note,
  'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z'
FROM payments p JOIN orders o ON o.id=p.order_id;

INSERT INTO cod_receivables(
  id,order_id,carrier,tracking_number,expected_cod_amount_vnd,status,shipped_at,notes,
  idempotency_key,created_by,created_at,updated_at
)
SELECT 'sheet-cod-'||source_order_id,source_order_id,'Đối tác HCM','',ROUND(collect_amount*1000000,0),
  'PENDING_DELIVERY','2026-10-01T00:00:00.000Z','Đang giao hàng, chờ thu COD theo Google Sheet',
  'sheet-cod-order-'||source_order_id,'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'
FROM _sheet_orders WHERE payment_status='cod';

INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,created_at,reference_type,reference_id)
SELECT id,'RECEIVED','IN_TRANSIT','QC','Nhận hàng từ snapshot Google Sheet','SYSTEM_MIGRATION',
  '2026-10-01T00:00:00.000Z','PURCHASE_BATCH',CAST(purchase_batch_id AS TEXT)
FROM laptops WHERE status IN ('available','sold');

INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,note,performed_by,created_at,reference_type,reference_id)
SELECT l.id,'QC_PASS','QC','store','QC PASS toàn bộ theo snapshot Google Sheet','SYSTEM_MIGRATION',
  '2026-10-01T00:00:00.000Z','QC_INSPECTION',q.id
FROM laptops l JOIN qc_inspections q ON q.laptop_id=l.id;

INSERT INTO stock_movements(laptop_id,movement_type,from_location,to_location,order_id,note,performed_by,created_at,reference_type,reference_id)
SELECT laptop_id,'SOLD','store','CUSTOMER',id,'Bán theo đơn hàng Google Sheet','SYSTEM_MIGRATION',
  '2026-10-01T00:00:00.000Z','ORDER',CAST(id AS TEXT)
FROM orders;

INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name,created_at)
SELECT 'PURCHASE_BATCH',CAST(id AS TEXT),'CREATE',json_object('source','GOOGLE_SHEET','supplier_id',supplier_id),
  'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z' FROM purchase_batches;
INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name,created_at)
SELECT 'QC_INSPECTION',id,'CREATE',json_object('source','GOOGLE_SHEET','disposition','PASS','laptop_id',laptop_id),
  'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z' FROM qc_inspections;
INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name,created_at)
SELECT 'ORDER',CAST(id AS TEXT),'CREATE',json_object('source','GOOGLE_SHEET','laptop_id',laptop_id,'payment_status',payment_status),
  'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z' FROM orders;
INSERT INTO activity_logs(entity_type,entity_id,action,changes,user_name,created_at)
SELECT 'PAYMENT',CAST(id AS TEXT),'CREATE',json_object('source','GOOGLE_SHEET','order_id',order_id,'amount',amount),
  'SYSTEM_MIGRATION','2026-10-01T00:00:00.000Z' FROM payments;

CREATE TABLE _migration_result_guard(valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO _migration_result_guard
SELECT CASE WHEN
  (SELECT COUNT(*) FROM laptops)=165
  AND (SELECT COUNT(*) FROM purchase_batches)=13
  AND (SELECT COUNT(*) FROM qc_inspections WHERE status='COMPLETED' AND result='PASS')=133
  AND (SELECT COUNT(*) FROM orders)=8
  AND (SELECT COUNT(*) FROM customers)=8
  AND (SELECT COUNT(*) FROM payments)=10
  AND (SELECT COUNT(*) FROM financial_records)=10
  AND (SELECT COUNT(*) FROM cod_receivables WHERE status='PENDING_DELIVERY')=2
  AND (SELECT COUNT(*) FROM laptops WHERE status='sold')=8
  AND (SELECT COUNT(*) FROM laptops WHERE status='available')=125
  AND (SELECT COUNT(*) FROM laptops WHERE status='in_transit')=29
  AND (SELECT COUNT(*) FROM laptops WHERE status='ignored')=3
THEN 1 ELSE 0 END;

DROP TABLE _migration_result_guard;
DROP TABLE _supplier_resolution_guard;
DROP TABLE _resolved_sheet_suppliers;
DROP TABLE _sheet_suppliers;
DROP TABLE _sheet_payments;
DROP TABLE _sheet_orders;
DROP TABLE _sheet_laptops;
