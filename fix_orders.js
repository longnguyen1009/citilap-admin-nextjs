const fs = require('fs');

let code = fs.readFileSync('components/pages/Orders.jsx', 'utf8');

const targetStr = `  const getOrderRowStatusClass = (ord) => {
    const opts = appOptions || [];
    if (isOrderCommitted(ord, opts) || isOrderCancelled(ord, opts)) {
      return 'order-row-completed';
    }
    if (isReservationActive(ord, opts)) {
      return 'order-row-deposited';
    }`;

const replacement = `  const getOrderRowStatusClass = (ord) => {
    if (isOrderCommitted(ord) || isOrderCancelled(ord)) {
      return 'order-row-completed';
    }
    if (isReservationActive(ord)) {
      return 'order-row-deposited';
    }`;

code = code.replace(targetStr, replacement);
fs.writeFileSync('components/pages/Orders.jsx', code);
console.log('Fixed appOptions error');
