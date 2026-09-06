const fs = require('fs');

let dbService = fs.readFileSync('lib/services/dbService.js', 'utf8');
dbService = dbService.replace(/wholesale_price_vnd,retail_price_vnd,custom_profit,/, '');
fs.writeFileSync('lib/services/dbService.js', dbService);

let apiClient = fs.readFileSync('lib/apiClient.js', 'utf8');
apiClient = apiClient.replace(/wholesale_price_vnd,retail_price_vnd,custom_profit,/, '');
fs.writeFileSync('lib/apiClient.js', apiClient);

console.log('Fixed LAPTOP_SELECT');
