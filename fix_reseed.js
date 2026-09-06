const fs = require('fs');

let reseed = fs.readFileSync('reseed_data.sql', 'utf8');
reseed = reseed.replace(/21700000, 22500000, 23500000,/, '21700000,');
reseed = reseed.replace(/16375000, 17500000, 18500000,/, '16375000,');
reseed = reseed.replace(/11050000, 11800000, 12500000,/, '11050000,');
fs.writeFileSync('reseed_data.sql', reseed);

console.log('Fixed reseed values');
