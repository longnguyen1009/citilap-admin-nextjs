const fs = require('fs');

function updateFile(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');

  // Replace discount_amount with sale_offline in ORDER_SELECT
  code = code.replace(/discount_amount/g, 'sale_offline');

  // dbService mappings
  code = code.replace(/discountAmount:\s*parseFloat\(dbRow\.sale_offline \|\| 0\),/g, 'saleOffline: dbRow.sale_offline,');
  code = code.replace(/discount_amount:\s*parseFloat\(order\.discountAmount \|\| 0\),/g, 'sale_offline: order.saleOffline || order.saleOfflineId || null,');

  // apiClient mappings (might not be needed if they don't map explicitly, wait let's use a regex)
  if (filePath.includes('apiClient.js')) {
    code = code.replace(/discountAmount:\s*dbRow\.sale_offline \|\| 0,/g, "saleOffline: toLabel('saleOffline', dbRow.sale_offline, '1'),");
    code = code.replace(/sale_offline:\s*order\.discountAmount \|\| 0,/g, "sale_offline: toKey('saleOffline', order.saleOffline, '1'),");
  }

  fs.writeFileSync(filePath, code);
  console.log('Updated ' + filePath);
}

updateFile('lib/services/dbService.js');
updateFile('lib/apiClient.js');
