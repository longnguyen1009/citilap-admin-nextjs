-- Draft component of the replacement import, not an automatic migration.
-- Create only the three suppliers explicitly approved by the user.
-- Preserve existing records; do not overwrite supplier details on code conflict.
INSERT INTO suppliers(code,name,display_name,wechat_name,country,active,created_by)
VALUES
 ('WE_TECH','Nhập thợ WECHAT','Nhập thợ WECHAT','','Trung Quốc',1,'SYSTEM_MIGRATION'),
 ('WE_A_BUT_KI','We-A Bút Kí','We-A Bút Kí','We-A Bút Kí','Trung Quốc',1,'SYSTEM_MIGRATION'),
 ('WE_DATANG','We-大唐数码（出售 出租）','We-大唐数码（出售 出租）','We-大唐数码（出售 出租）','Trung Quốc',1,'SYSTEM_MIGRATION')
ON CONFLICT(code) DO NOTHING;
