const fs = require('fs');
let code = fs.readFileSync('lib/fieldOptions.js', 'utf8');

const startIdx = code.indexOf("{ key: '2',     defaultLabel: 'Thắng Zalo' },");
const endIdx = code.indexOf("  },\n", startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  code = code.substring(0, startIdx) + code.substring(endIdx + 5);
  fs.writeFileSync('lib/fieldOptions.js', code);
  console.log('Fixed fieldOptions.js');
} else {
  console.log('Not found');
}
