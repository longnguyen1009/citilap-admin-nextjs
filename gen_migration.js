const fs = require('fs');

const fieldOptionsContent = fs.readFileSync('lib/fieldOptions.js', 'utf8');

// Parse FIELD_OPTION_GROUPS from the string
const match = fieldOptionsContent.match(/export const FIELD_OPTION_GROUPS = (\{[\s\S]*?\n\});/);

if (!match) {
  console.error("Could not find FIELD_OPTION_GROUPS");
  process.exit(1);
}

// Convert string to object
const FIELD_OPTION_GROUPS = eval('(' + match[1] + ')');

let sql = `-- Tạo bảng app_options
DROP TABLE IF EXISTS app_options CASCADE;
CREATE TABLE app_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_key TEXT NOT NULL,
  option_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(group_key, option_key)
);

-- Bật RLS
ALTER TABLE app_options ENABLE ROW LEVEL SECURITY;

-- Chính sách
CREATE POLICY "Cho phép đọc options" ON app_options FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Cho phép ghi options" ON app_options FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Cho phép cập nhật options" ON app_options FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Cho phép xóa options" ON app_options FOR DELETE USING (auth.role() = 'authenticated');

-- Seed Data\n`;

sql += 'INSERT INTO app_options (group_key, option_key, label, sort_order) VALUES\n';
const values = [];

Object.values(FIELD_OPTION_GROUPS).forEach(group => {
  group.options.forEach((opt, index) => {
    values.push(`('${group.key}', '${opt.key}', '${opt.defaultLabel.replace(/'/g, "''")}', ${index})`);
  });
});

sql += values.join(',\n') + ';\n\n';

sql += `-- Cập nhật Laptops
ALTER TABLE laptops
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS charger_status,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS seller,
  DROP COLUMN IF EXISTS screen_status,
  DROP COLUMN IF EXISTS camera_mic_status,
  DROP COLUMN IF EXISTS mainboard_status;

ALTER TABLE laptops
  ADD COLUMN category_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN location_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN charger_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN seller_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN screen_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN camera_mic_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN mainboard_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL;
\n`;

sql += `-- Cập nhật Orders
ALTER TABLE orders
  DROP COLUMN IF EXISTS sale_online,
  DROP COLUMN IF EXISTS order_type,
  DROP COLUMN IF EXISTS order_status,
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS delivery_status,
  DROP COLUMN IF EXISTS shipping_method,
  DROP COLUMN IF EXISTS gifts;

ALTER TABLE orders
  ADD COLUMN sale_online_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN order_type_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN order_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN payment_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN payment_method_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN delivery_status_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN shipping_method_id UUID REFERENCES app_options(id) ON DELETE SET NULL,
  ADD COLUMN gifts_id UUID REFERENCES app_options(id) ON DELETE SET NULL;
\n`;

fs.writeFileSync('migration_options.sql', sql);
console.log('SQL Migration written successfully');
