const fs = require('fs');

let code = fs.readFileSync('lib/apiClient.js', 'utf8');

code = code.replace(/saleOnline:\s*toLabel\('saleOnline',\s*dbRow\.sale_online,\s*'1'\),/, 
  "saleOnline: toLabel('saleOnline', dbRow.sale_online, '1'),\n    saleOffline: toLabel('saleOffline', dbRow.sale_offline, '1'),");

code = code.replace(/sale_online:\s*toKey\('saleOnline',\s*order\.saleOnline,\s*'1'\),/, 
  "sale_online: toKey('saleOnline', order.saleOnline, '1'),\n      sale_offline: toKey('saleOffline', order.saleOffline, '1'),");

fs.writeFileSync('lib/apiClient.js', code);
console.log('Updated apiClient.js mappings');
