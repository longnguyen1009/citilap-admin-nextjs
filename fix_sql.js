const fs = require('fs');

let init = fs.readFileSync('init_full_db.sql', 'utf8');
const initLines = init.split('\n');
const newInit = initLines.filter(l => !l.includes('wholesale_price_vnd NUMERIC') && !l.includes('retail_price_vnd NUMERIC') && !l.includes('custom_profit NUMERIC'));
fs.writeFileSync('init_full_db.sql', newInit.join('\n'));

let reseed = fs.readFileSync('reseed_data.sql', 'utf8');
reseed = reseed.replace(/wholesale_price_vnd, retail_price_vnd, /g, '');
reseed = reseed.replace(/22.0, 23.5, /g, '');
reseed = reseed.replace(/20.0, 21.5, /g, '');
fs.writeFileSync('reseed_data.sql', reseed);

console.log('Fixed sql files');
