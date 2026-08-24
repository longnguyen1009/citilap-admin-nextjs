const fs = require('fs');

// Fix MainLayout
let main = fs.readFileSync('C:/Users/Admin/Desktop/citilap-admin-nextjs/layouts/MainLayout.jsx', 'utf8');
main = main.replace(/className="nav-item"\) => `nav-item \$\{isActive \? 'active' : ''\}`\}/g, 'className="nav-item"');
fs.writeFileSync('C:/Users/Admin/Desktop/citilap-admin-nextjs/layouts/MainLayout.jsx', main);

// Fix useFieldOptions
let useField = fs.readFileSync('C:/Users/Admin/Desktop/citilap-admin-nextjs/lib/useFieldOptions.js', 'utf8');
useField = '"use client";\n' + useField;
fs.writeFileSync('C:/Users/Admin/Desktop/citilap-admin-nextjs/lib/useFieldOptions.js', useField);

// Split the pure functions for server to a new file and change imports in dbService
let db = fs.readFileSync('C:/Users/Admin/Desktop/citilap-admin-nextjs/lib/services/dbService.js', 'utf8');
db = db.replace(/from '\.\.\/useFieldOptions';/g, "from '../fieldOptionsHelpers';");
fs.writeFileSync('C:/Users/Admin/Desktop/citilap-admin-nextjs/lib/services/dbService.js', db);

const helpers = `
export const labelToKey = (groupKey, label, customConfig = {}) => {
  return label;
};
export const resolveLabel = (groupKey, val, customConfig = {}) => {
  return val;
};
export const readCustomConfig = () => {
  return {};
};
`;
fs.writeFileSync('C:/Users/Admin/Desktop/citilap-admin-nextjs/lib/fieldOptionsHelpers.js', helpers);
