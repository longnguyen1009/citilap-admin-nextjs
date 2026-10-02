-- Add the combined sales + technical role and install the canonical startup catalog.
PRAGMA foreign_keys = OFF;

DROP TRIGGER IF EXISTS auth_profile_revoke;
CREATE TABLE user_profiles_next (
  id TEXT NOT NULL PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'SALES'
    CHECK (role IN ('ADMIN','SALES','TECH','TECHNICAL','SALES_TECH','STAFF')),
  is_active INTEGER DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO user_profiles_next SELECT id,name,role,is_active,created_at,updated_at FROM user_profiles;
DROP TABLE user_profiles;
ALTER TABLE user_profiles_next RENAME TO user_profiles;
CREATE TRIGGER auth_profile_revoke AFTER UPDATE OF is_active,role ON user_profiles
BEGIN
  DELETE FROM auth_sessions WHERE user_id = NEW.id;
END;

INSERT INTO suppliers (
  id,code,name,display_name,country,preferred_shipping_destination,notes,active,created_by
) VALUES
  ('1','VN_TECH','Nhập thợ VN','Nhập thợ VN','Việt Nam','OTHER','Nguồn nhập nội địa mặc định',1,'SYSTEM'),
  ('2','RETAIL_BUYBACK','Thu lại khách lẻ','Thu lại khách lẻ','Việt Nam','OTHER','Nguồn thu lại từ khách lẻ',1,'SYSTEM')
ON CONFLICT(id) DO UPDATE SET
  code=excluded.code,name=excluded.name,display_name=excluded.display_name,country=excluded.country,
  preferred_shipping_destination=excluded.preferred_shipping_destination,notes=excluded.notes,active=1;

UPDATE app_options SET is_active=0
WHERE group_key IN ('category','laptopLocation','paymentMethod','shippingMethod');
DELETE FROM app_options WHERE group_key IN ('saleOnline','saleOffline');

INSERT INTO app_options(group_key,option_key,label,is_active,sort_order) VALUES
  ('category','legion_5_21_22','Legion 5 21-22',1,0),
  ('category','legion_5_23_24','Legion 5 23-24',1,1),
  ('category','legion_5_25_26','Legion 5 25-26',1,2),
  ('category','legion_5_pro_21_22','Legion 5 Pro 21-22',1,3),
  ('category','legion_5_pro_23_24','Legion 5 Pro 23-24',1,4),
  ('category','legion_5_pro_25_26','Legion 5 Pro 25-26',1,5),
  ('category','legion_7','Legion 7',1,6),
  ('category','loq','LOQ',1,7),
  ('category','acer_nitro_5_21_22','Acer Nitro 5 21-22',1,8),
  ('category','acer_neo_16_23_25','Acer Neo 16 23-25',1,9),
  ('category','rog_strix_g16_g18','ROG Strix G16-G18',1,10),
  ('category','asus_zephyrus_g14_g16','ASUS Zephyrus G14-G16',1,11),
  ('category','asus_tuf','ASUS TUF',1,12),
  ('category','lenovo_other','Lenovo khác',1,13),
  ('category','acer','Acer',1,14),
  ('category','asus','Asus',1,15),
  ('category','lenovo','Lenovo',1,16),
  ('category','dell','Dell',1,17),
  ('category','hp','HP',1,18),
  ('category','msi','MSI',1,19),
  ('category','razer','Razer',1,20),
  ('category','macbook','MacBook',1,21),
  ('category','huawei','Huawei',1,22),
  ('category','xiaomi','Xiaomi',1,23),
  ('category','other','Phân loại khác',1,24),
  ('laptopLocation','store','CH',1,0),
  ('laptopLocation','wh','KHO',1,1),
  ('laptopLocation','media','MEDIA',1,2),
  ('laptopLocation','repair','Sửa chữa',1,3),
  ('laptopLocation','other','Vị trí khác',1,4),
  ('paymentMethod','transfer_cash','Chuyển khoản',1,0),
  ('paymentMethod','cash','Tiền mặt',1,1),
  ('paymentMethod','card','Quẹt thẻ',1,2),
  ('paymentMethod','installment','Trả góp',1,3),
  ('shippingMethod','direct_store','Trực tiếp Shop',1,0),
  ('shippingMethod','direct_ship','Ship trực tiếp khách',1,1),
  ('shippingMethod','viettelpost','ViettelPost',1,2),
  ('shippingMethod','shopee_spx','Shopee SPX',1,3),
  ('shippingMethod','hcm_agent','Nhờ HCM giao dịch',1,4),
  ('shippingMethod','hai_an','Nhà xe Hải An',1,5),
  ('shippingMethod','shared_car','Xe Ghép',1,6),
  ('shippingMethod','bus','Xe khách',1,7)
ON CONFLICT(group_key,option_key) DO UPDATE SET
  label=excluded.label,is_active=1,sort_order=excluded.sort_order,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');

PRAGMA foreign_keys = ON;
