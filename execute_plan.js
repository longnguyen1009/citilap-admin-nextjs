const fs = require('fs');

// Patch dbService.js
let dbCode = fs.readFileSync('lib/services/dbService.js', 'utf8');
dbCode = dbCode.replace(/\s*custradeInLaptopId:\s*dbRow\.trade_in_laptop_id,?\n/, '\n');
fs.writeFileSync('lib/services/dbService.js', dbCode);
console.log('Patched dbService.js');

// Patch Orders.jsx
let ordCode = fs.readFileSync('components/pages/Orders.jsx', 'utf8');
ordCode = ordCode.replace(/import \{ labelToKey, getOptions, getLabel \} from '\.\.\/\.\.\/lib\/useFieldOptions';/, "import { getOptions, getLabel } from '../../lib/useFieldOptions';");

const oldDestructure = `    getSelectableLaptops,
    getLaptopAssignmentError,
    getOptions,
    getLabel,
    cloudStatus
  } = useInventory();`;
const newDestructure = `    getSelectableLaptops,
    getLaptopAssignmentError,
    getOptions,
    getLabel,
    labelToKey,
    appOptions,
    cloudStatus
  } = useInventory();`;
ordCode = ordCode.replace(oldDestructure, newDestructure);

const oldStatusClass = `  const getOrderRowStatusClass = (ord) => {
    const opts = (typeof appOptions !== 'undefined') ? appOptions : [];
    if (isOrderCommitted(ord, opts) || isOrderCancelled(ord, opts)) {
      return 'order-row-completed';
    }
    if (isReservationActive(ord, opts)) {
      return 'order-row-deposited';
    }
    const sKey = (typeof labelToKey === 'function') ? labelToKey('orderStatus', ord.orderStatus) : null;
    if (['shipping', 'prepared'].includes(sKey) || ord.deliveryStatus === 'Đã gửi hàng' || ord.deliveryStatus === 'Đang giao hàng') {
      return 'order-row-shipping';
    }
    return 'order-row-new';
  };`;
const newStatusClass = `  const getOrderRowStatusClass = (ord) => {
    const opts = appOptions || [];
    if (isOrderCommitted(ord, opts) || isOrderCancelled(ord, opts)) {
      return 'order-row-completed';
    }
    if (isReservationActive(ord, opts)) {
      return 'order-row-deposited';
    }
    const sKey = labelToKey ? labelToKey('orderStatus', ord.orderStatus) : null;
    if (['shipping', 'prepared'].includes(sKey) || ord.deliveryStatus === 'Đã gửi hàng' || ord.deliveryStatus === 'Đang giao hàng') {
      return 'order-row-shipping';
    }
    return 'order-row-new';
  };`;
ordCode = ordCode.replace(oldStatusClass, newStatusClass);

fs.writeFileSync('components/pages/Orders.jsx', ordCode);
console.log('Patched Orders.jsx');
