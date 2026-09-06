const fs = require('fs');

let code = fs.readFileSync('components/pages/Inventory.jsx', 'utf8');

const targetStr = `      importPriceVnd: laptop.importPriceVnd || '',
      importPriceManuallyEdited: false,
      trackingCode: laptop.trackingCode || ''`;

const replacement = `      importPriceVnd: laptop.importPriceVnd || '',
      importPriceManuallyEdited: Boolean(laptop.importPriceVnd && Number(laptop.importPriceVnd) !== computeImportPrice(laptop.priceRmb, laptop.shippingRmb, laptop.exchangeRate || formulaConfig.defaultRate, formulaConfig)),
      trackingCode: laptop.trackingCode || ''`;

code = code.replace(targetStr, replacement);
fs.writeFileSync('components/pages/Inventory.jsx', code);
console.log('Fixed handleOpenEdit');
