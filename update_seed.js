const fs = require('fs');

let code = fs.readFileSync('reseed_data.sql', 'utf8');
const deleteStatements = `-- 0. Xóa dữ liệu cũ (TÙY CHỌN, cẩn thận trên production)
DELETE FROM stock_movements;
DELETE FROM warranty_cases;
DELETE FROM orders;
DELETE FROM laptops;
DELETE FROM customers;
DELETE FROM app_settings;

`;

if (!code.includes('DELETE FROM')) {
  code = deleteStatements + code;
  fs.writeFileSync('reseed_data.sql', code);
  console.log('Added DELETE statements to reseed_data.sql');
} else {
  console.log('DELETE statements already exist in reseed_data.sql');
}
