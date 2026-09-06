const fs = require('fs');
let code = fs.readFileSync('context/InventoryContext.jsx', 'utf8');

// Replace SALE_ONLINE_OPTIONS adding SALE_OFFLINE_OPTIONS
if (!code.includes('SALE_OFFLINE_OPTIONS')) {
  code = code.replace(
    /export const SALE_ONLINE_OPTIONS\s*=\s*getOptionLabels\('saleOnline', _cfg\(\)\);/,
    "export const SALE_ONLINE_OPTIONS       = getOptionLabels('saleOnline', _cfg());\nexport const SALE_OFFLINE_OPTIONS      = getOptionLabels('saleOffline', _cfg());"
  );
  
  code = code.replace(
    /SALE_ONLINE_OPTIONS:\s*getOptionLabels\('saleOnline', appOptions\),/,
    "SALE_ONLINE_OPTIONS:        getOptionLabels('saleOnline', appOptions),\n    SALE_OFFLINE_OPTIONS:       getOptionLabels('saleOffline', appOptions),"
  );
}

fs.writeFileSync('context/InventoryContext.jsx', code);
console.log('Updated InventoryContext.jsx');
