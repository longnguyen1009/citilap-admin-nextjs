const fs = require('fs');

const updateComponent = (filePath, replacements) => {
  let code = fs.readFileSync(filePath, 'utf8');

  replacements.forEach(group => {
    // Regex for: GROUP.map(x => ( <option ... >{x}</option> ))
    // Matches: x => (<option key={x} value={x}>{x}</option>)
    // Matches: x => <option ...>{x}</option>
    // We will just replace {x} with {x.label} and value={x} with value={x.key}
    
    // First, let's just do a string replace for the map function for this group
    const regex = new RegExp(group + '\\.map\\(\\s*([a-zA-Z0-9_]+)\\s*=>\\s*\\(?(?:<option[^>]*>).*?<\\/option>\\)?\\s*\\)', 'g');
    
    code = code.replace(regex, (match, p1) => {
      // Re-construct the option correctly
      return `${group}.map(${p1} => (<option key={${p1}.key} value={${p1}.key}>{${p1}.label}</option>))`;
    });
  });

  fs.writeFileSync(filePath, code);
  console.log(filePath + ' options updated');
};

const orderGroups = [
  'SALE_ONLINE_OPTIONS',
  'SHIPPING_METHOD_OPTIONS',
  'ORDER_STATUS_OPTIONS',
  'PAYMENT_STATUS_OPTIONS',
  'DELIVERY_STATUS_OPTIONS',
  'GIFT_OPTIONS',
  'ORDER_TYPES',
  'PAYMENT_METHODS'
];

updateComponent('components/pages/Orders.jsx', orderGroups);

const inventoryGroups = [
  'STATUS_OPTIONS',
  'LOCATION_OPTIONS',
  'CHARGER_OPTIONS',
  'CATEGORY_OPTIONS',
  'SELLER_OPTIONS'
];

updateComponent('components/pages/Inventory.jsx', inventoryGroups);

const warrantyGroups = [
  'WARRANTY_CASE_STATUS_OPTIONS'
];
updateComponent('components/pages/Warranty.jsx', warrantyGroups);

