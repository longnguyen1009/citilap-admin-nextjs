const fs = require('fs');
const parser = require('@babel/parser');

try {
  const code = fs.readFileSync('components/pages/Inventory.jsx', 'utf8');
  parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  console.log('Syntax is OK');
} catch (err) {
  console.log('Syntax error: ' + err.message);
  console.log('Line: ' + err.loc.line + ', Col: ' + err.loc.column);
}
