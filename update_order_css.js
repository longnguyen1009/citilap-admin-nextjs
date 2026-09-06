const fs = require('fs');
let code = fs.readFileSync('app/globals.css', 'utf8');

const startStr = '/* Order Row Color Coding (User Specific Rules) */';
const endStr = '/* Table enhancements for 20 columns';

const startIdx = code.indexOf(startStr);
const endIdx = code.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
  const newCss = `/* Order Row Color Coding (Minimalist) */
/* 1. Đơn đang chuẩn bị, chưa giao hàng (Màu hồng siêu nhạt) */
tr.order-row-preparing td,
tr.order-row-preparing td.sticky-col-1,
tr.order-row-preparing td.sticky-col-2 {
    background-color: #fdf2f8 !important;
    color: #334155 !important;
}
tr.order-row-preparing td input, tr.order-row-preparing td textarea, tr.order-row-preparing td select, tr.order-row-preparing td span { color: #334155 !important; }

/* 2. Đang giao hàng / Đang chờ COD (Màu vàng siêu nhạt) */
tr.order-row-shipping td,
tr.order-row-shipping td.sticky-col-1,
tr.order-row-shipping td.sticky-col-2 {
    background-color: #fefce8 !important;
    color: #334155 !important;
}
tr.order-row-shipping td input, tr.order-row-shipping td textarea, tr.order-row-shipping td select, tr.order-row-shipping td span { color: #334155 !important; }

/* 3. Đã hoàn thành, thu tiền xong (Màu xám siêu nhạt) */
tr.order-row-completed td,
tr.order-row-completed td.sticky-col-1,
tr.order-row-completed td.sticky-col-2 {
    background-color: #f8fafc !important;
    color: #475569 !important;
}
tr.order-row-completed td input, tr.order-row-completed td textarea, tr.order-row-completed td select, tr.order-row-completed td span { color: #475569 !important; }

/* 4. Hủy / Back máy / Đổi máy (Màu đỏ siêu nhạt) */
tr.order-row-cancelled td,
tr.order-row-cancelled td.sticky-col-1,
tr.order-row-cancelled td.sticky-col-2 {
    background-color: #fef2f2 !important;
    color: #475569 !important;
}
tr.order-row-cancelled td input, tr.order-row-cancelled td textarea, tr.order-row-cancelled td select, tr.order-row-cancelled td span { color: #475569 !important; }

/* 5. Cọc / Reservation (Màu xanh siêu nhạt) */
tr.order-row-deposited td,
tr.order-row-deposited td.sticky-col-1,
tr.order-row-deposited td.sticky-col-2 {
    background-color: #f0fdfa !important;
    color: #334155 !important;
}
tr.order-row-deposited td input, tr.order-row-deposited td textarea, tr.order-row-deposited td select, tr.order-row-deposited td span { color: #334155 !important; }

/* Hover effects cho tất cả input trong Order table để nổi bật */
tr td .sheet-cell-input:hover,
tr td .sheet-cell-select:hover,
tr td .sheet-cell-textarea:hover {
    background: rgba(255,255,255,0.8) !important;
    box-shadow: inset 0 0 0 1px #cbd5e1 !important;
}
tr td .sheet-cell-input:focus,
tr td .sheet-cell-select:focus,
tr td .sheet-cell-textarea:focus {
    background: #ffffff !important;
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
}

`;

  code = code.substring(0, startIdx) + newCss + code.substring(endIdx);
  fs.writeFileSync('app/globals.css', code);
  console.log('Successfully applied minimalist styles.');
} else {
  console.log('Could not find start or end block.');
}
