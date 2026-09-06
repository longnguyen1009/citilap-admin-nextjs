const fs = require('fs');
let code = fs.readFileSync('lib/fieldOptions.js', 'utf8');

const startIdx = code.indexOf('  saleOnline: {');
const endIdx = code.indexOf('  seller: {');

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `  saleOnline: {
    key: 'saleOnline',
    defaultLabel: 'Nhân viên sale online',
    options: [
      { key: '1',     defaultLabel: 'Thắng Tiktok' },
      { key: '2',     defaultLabel: 'Thắng Zalo' },
      { key: '3',     defaultLabel: 'Vương' },
      { key: '4',     defaultLabel: 'Quế Anh' },
      { key: '5',     defaultLabel: 'Quảng' },
      { key: '6',     defaultLabel: 'Linh' },
      { key: '7',     defaultLabel: 'Hoàng' },
      { key: '8',     defaultLabel: 'Tuấn' },
      { key: 'other', defaultLabel: 'Khác' },
    ],
  },

  saleOffline: {
    key: 'saleOffline',
    defaultLabel: 'Nhân viên sale offline',
    options: [
      { key: '1',     defaultLabel: 'Thắng' },
      { key: '2',     defaultLabel: 'Vương' },
      { key: 'other', defaultLabel: 'Khác' },
    ],
  },

`;
  code = code.substring(0, startIdx) + replacement + code.substring(endIdx);
  fs.writeFileSync('lib/fieldOptions.js', code);
  console.log('Fixed fieldOptions.js completely');
} else {
  console.log('Not found');
}
