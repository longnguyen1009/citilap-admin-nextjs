const fs = require('fs');
let code = fs.readFileSync('lib/fieldOptions.js', 'utf8');

if (!code.includes('saleOffline:')) {
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
  },`;

  code = code.replace(/  saleOnline: \{[\s\S]*?\},/, replacement);
  fs.writeFileSync('lib/fieldOptions.js', code);
  console.log('Updated fieldOptions.js');
} else {
  console.log('saleOffline already exists in fieldOptions.js');
}
