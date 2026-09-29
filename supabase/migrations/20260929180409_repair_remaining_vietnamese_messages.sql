-- Repair encoding in effective RPC messages only; preserve logic and permissions.
-- accept_trade_in
-- add_manual_laptop_cost
-- add_repair_action
-- add_repair_part
-- approve_commission
-- assert_cash_account
-- cancel_pending_commissions_for_order
-- cancel_repair_job
-- cancel_reservation
-- complete_repair_job
-- complete_trade_in_inspection
-- convert_reservation_to_order
-- convert_trade_in_to_inventory
-- create_cash_account
-- create_cod_receivable
-- create_reservation
-- create_trade_in
-- enforce_order_customer_obligation
-- enforce_warranty_case_integrity
-- extend_reservation
-- generate_commission
-- get_management_dashboard
-- guard_account_transaction_history
-- guard_active_reservation_order_assignment
-- guard_closed_supplier_return_history
-- guard_commission_history
-- guard_confirmed_purchase_batch
-- guard_laptop_cost_component_history
-- guard_laptop_status_transition
-- guard_order_cost_snapshot
-- guard_order_sellable_laptop
-- guard_repair_history
-- guard_trade_in_economic_history
-- ignore_incoming_laptop
-- link_supplier_replacement
-- pay_commission
-- post_manual_account_transaction
-- prevent_completed_qc_mutation
-- prevent_supplier_payment_mutation
-- prevent_supplier_refund_mutation
-- receive_purchase_laptops
-- receive_trade_in
-- receive_unknown_laptop
-- reconcile_cash_account
-- reconcile_unknown_laptop
-- record_cod_settlement
-- record_order_payment_with_account
-- record_supplier_payment
-- record_supplier_payment_with_account
-- record_supplier_refund
-- record_supplier_refund_with_account
-- refresh_laptop_inventory
-- reject_trade_in
-- remove_repair_part
-- save_order_invoice_fields
-- start_repair_job
-- start_trade_in_inspection
-- sync_laptop_cost_components
-- transfer_cash_accounts
-- transition_cod_receivable
-- transition_supplier_return
-- update_cash_account
-- update_repair_job
-- validate_repair_assignee
-- void_manual_laptop_cost
BEGIN;
DO $repair$
DECLARE fn record; mapping record; original text; repaired text;
BEGIN
  FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' LOOP
    original := pg_get_functiondef(fn.oid);
    repaired := original;
    FOR mapping IN SELECT * FROM (VALUES
('''Trung Quá»‘c''','''Trung Quốc'''),
('''Laptop % khÃ´ng tá»“n táº¡i''','''Laptop % không tồn tại'''),
('''Danh sÃ¡ch quÃ  táº·ng khÃ´ng há»£p lá»‡''','''Danh sách quà tặng không hợp lệ'''),
('''Phá»¥ kiá»‡n khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ ngá»«ng sá»­ dá»¥ng''','''Phụ kiện không tồn tại hoặc đã ngừng sử dụng'''),
('''KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng''','''Không tìm thấy đơn hàng'''),
('''Chá»‰ xuáº¥t hÃ³a Ä‘Æ¡n khi Ä‘Æ¡n Ä‘ang giao hÃ ng hoáº·c Ä‘Ã£ hoÃ n thÃ nh''','''Chỉ xuất hóa đơn khi đơn đang giao hàng hoặc đã hoàn thành'''),
('''ÄÆ¡n hÃ ng chÆ°a cÃ³ giÃ¡ bÃ¡n há»£p lá»‡''','''Đơn hàng chưa có giá bán hợp lệ'''),
('''Vui lÃ²ng chá»n chi nhÃ¡nh bÃ¡n hÃ ng trong Ä‘Æ¡n''','''Vui lòng chọn chi nhánh bán hàng trong đơn'''),
('''ÄÆ¡n chÆ°a cÃ³ laptop''','''Đơn chưa có laptop'''),
('''Vui lÃ²ng chá»n khÃ¡ch hÃ ng cÃ³ tÃªn, SÄT vÃ  Ä‘á»‹a chá»‰''','''Vui lòng chọn khách hàng có tên, SĐT và địa chỉ'''),
('''KhÃ¡ch hÃ ng thiáº¿u tÃªn hoáº·c sá»‘ Ä‘iá»‡n thoáº¡i''','''Khách hàng thiếu tên hoặc số điện thoại'''),
('''Cáº§n ghi nháº­n Ã­t nháº¥t má»™t khoáº£n Ä‘áº·t cá»c trÆ°á»›c khi xuáº¥t hÃ³a Ä‘Æ¡n''','''Cần ghi nhận ít nhất một khoản đặt cọc trước khi xuất hóa đơn'''),
(''' Â· ''',''' · '''),
('''Idempotency key khÃ´ng há»£p lá»‡''','''Idempotency key không hợp lệ'''),
('''LÃ´ mua khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng cÃ²n nháº­n thanh toÃ¡n''','''Lô mua không tồn tại hoặc không còn nhận thanh toán'''),
('''Sá»‘ tiá»n vÆ°á»£t cÃ´ng ná»£ cÃ²n láº¡i''','''Số tiền vượt công nợ còn lại'''),
('''Tá»· giÃ¡ khÃ´ng há»£p lá»‡''','''Tỷ giá không hợp lệ'''),
('''PhÆ°Æ¡ng thá»©c thanh toÃ¡n khÃ´ng há»£p lá»‡''','''Phương thức thanh toán không hợp lệ'''),
('''KhÃ´ng thá»ƒ thay Ä‘á»•i thÃ´ng tin tÃ i chÃ­nh cá»§a lÃ´ Ä‘Ã£ xÃ¡c nháº­n''','''Không thể thay đổi thông tin tài chính của lô đã xác nhận'''),
('''Thanh toÃ¡n nhÃ  cung cáº¥p lÃ  sá»• báº¥t biáº¿n; hÃ£y táº¡o giao dá»‹ch Ä‘iá»u chá»‰nh''','''Thanh toán nhà cung cấp là sổ bất biến; hãy tạo giao dịch điều chỉnh'''),
('''Laptop khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ ngá»«ng sá»­ dá»¥ng''','''Laptop không tồn tại hoặc đã ngừng sử dụng'''),
('''Laptop chÆ°a sáºµn sÃ ng Ä‘á»ƒ bÃ¡n (tráº¡ng thÃ¡i: %)''','''Laptop chưa sẵn sàng để bán (trạng thái: %)'''),
('''Laptop khÃ´ng á»Ÿ tráº¡ng thÃ¡i Chá» QC''','''Laptop không ở trạng thái Chờ QC'''),
('''Laptop Ä‘ang cÃ³ phiÃªn QC hoáº¡t Ä‘á»™ng''','''Laptop đang có phiên QC hoạt động'''),
('''MÃ n hÃ¬nh''','''Màn hình'''),
('''BÃ n phÃ­m''','''Bàn phím'''),
('''ÄÃ¨n bÃ n phÃ­m''','''Đèn bàn phím'''),
('''Sá»©c khá»e SSD''','''Sức khỏe SSD'''),
('''Quáº¡t''','''Quạt'''),
('''Táº£n nhiá»‡t''','''Tản nhiệt'''),
('''Sáº¡c''','''Sạc'''),
('''Ngoáº¡i hÃ¬nh''','''Ngoại hình'''),
('''Chá»‰ cÃ³ thá»ƒ cáº­p nháº­t phiÃªn QC Ä‘ang thá»±c hiá»‡n''','''Chỉ có thể cập nhật phiên QC đang thực hiện'''),
('''Checklist QC khÃ´ng há»£p lá»‡''','''Checklist QC không hợp lệ'''),
('''Káº¿t quáº£ checklist khÃ´ng há»£p lá»‡''','''Kết quả checklist không hợp lệ'''),
('''Má»¥c FAIL/WARNING pháº£i cÃ³ ghi chÃº (%)''','''Mục FAIL/WARNING phải có ghi chú (%)'''),
('''Má»¥c checklist khÃ´ng thuá»™c inspection (%)''','''Mục checklist không thuộc inspection (%)'''),
('''KhÃ´ng tÃ¬m tháº¥y phiÃªn QC''','''Không tìm thấy phiên QC'''),
('''PhiÃªn QC khÃ´ng cÃ²n há»£p lá»‡''','''Phiên QC không còn hợp lệ'''),
('''Káº¿t quáº£ QC khÃ´ng há»£p lá»‡''','''Kết quả QC không hợp lệ'''),
('''PhÃ¢n háº¡ng ngoáº¡i hÃ¬nh khÃ´ng há»£p lá»‡''','''Phân hạng ngoại hình không hợp lệ'''),
('''KhÃ´ng thá»ƒ PASS khi checklist báº¯t buá»™c chÆ°a Ä‘áº¡t''','''Không thể PASS khi checklist bắt buộc chưa đạt'''),
('''Tráº¡ng thÃ¡i laptop khÃ´ng khá»›p phiÃªn QC''','''Trạng thái laptop không khớp phiên QC'''),
('''Lá»‹ch sá»­ QC Ä‘Ã£ káº¿t thÃºc lÃ  báº¥t biáº¿n''','''Lịch sử QC đã kết thúc là bất biến'''),
('''Checklist cá»§a phiÃªn QC Ä‘Ã£ káº¿t thÃºc lÃ  báº¥t biáº¿n''','''Checklist của phiên QC đã kết thúc là bất biến'''),
('''Ká»¹ thuáº­t viÃªn Ä‘Æ°á»£c giao khÃ´ng há»£p lá»‡''','''Kỹ thuật viên được giao không hợp lệ'''),
('''Laptop khÃ´ng á»Ÿ tráº¡ng thÃ¡i Ä‘Æ°á»£c táº¡o phiáº¿u sá»­a''','''Laptop không ở trạng thái được tạo phiếu sửa'''),
('''QC nguá»“n khÃ´ng há»£p lá»‡''','''QC nguồn không hợp lệ'''),
('''Phiáº¿u sá»­a khÃ´ng cÃ²n Ä‘Æ°á»£c cáº­p nháº­t''','''Phiếu sửa không còn được cập nhật'''),
('''Chuyá»ƒn tráº¡ng thÃ¡i sá»­a chá»¯a khÃ´ng há»£p lá»‡ (% â†’ %)''','''Chuyển trạng thái sửa chữa không hợp lệ (% → %)'''),
('''Phiáº¿u sá»­a khÃ´ng hoáº¡t Ä‘á»™ng''','''Phiếu sửa không hoạt động'''),
('''TÃªn linh kiá»‡n khÃ´ng há»£p lá»‡''','''Tên linh kiện không hợp lệ'''),
('''Linh kiá»‡n khÃ´ng tá»“n táº¡i hoáº·c phiáº¿u Ä‘Ã£ káº¿t thÃºc''','''Linh kiện không tồn tại hoặc phiếu đã kết thúc'''),
('''Ná»™i dung thao tÃ¡c khÃ´ng há»£p lá»‡''','''Nội dung thao tác không hợp lệ'''),
('''Vui lÃ²ng cáº­p nháº­t á»©ng dá»¥ng Ä‘á»ƒ chá»n káº¿t quáº£ vÃ  hÃ nh Ä‘á»™ng Ä‘á» xuáº¥t''','''Vui lòng cập nhật ứng dụng để chọn kết quả và hành động đề xuất'''),
('''KhÃ´ng thá»ƒ há»§y phiáº¿u sá»­a''','''Không thể hủy phiếu sửa'''),
('''Há»§y: ''','''Hủy: '''),
('''Tráº¡ng thÃ¡i sá»­a chá»¯a chá»‰ Ä‘Æ°á»£c Ä‘á»•i qua Repair workflow''','''Trạng thái sửa chữa chỉ được đổi qua Repair workflow'''),
('''Lá»‹ch sá»­ sá»­a chá»¯a Ä‘Ã£ káº¿t thÃºc lÃ  báº¥t biáº¿n''','''Lịch sử sửa chữa đã kết thúc là bất biến'''),
('''Chi tiáº¿t sá»­a chá»¯a Ä‘Ã£ káº¿t thÃºc lÃ  báº¥t biáº¿n''','''Chi tiết sửa chữa đã kết thúc là bất biến'''),
('''KhÃ´ng tÃ¬m tháº¥y phiáº¿u sá»­a''','''Không tìm thấy phiếu sửa'''),
('''Chá»‰ cÃ³ thá»ƒ hoÃ n táº¥t phiáº¿u Ä‘ang TESTING''','''Chỉ có thể hoàn tất phiếu đang TESTING'''),
('''Káº¿t quáº£ sá»­a chá»¯a khÃ´ng há»£p lá»‡''','''Kết quả sửa chữa không hợp lệ'''),
('''KhÃ´ng tÃ¬m tháº¥y phiáº¿u tráº£ nhÃ  cung cáº¥p''','''Không tìm thấy phiếu trả nhà cung cấp'''),
('''Chuyá»ƒn tráº¡ng thÃ¡i tráº£ NCC khÃ´ng há»£p lá»‡''','''Chuyển trạng thái trả NCC không hợp lệ'''),
('''Cáº§n Ä‘Æ¡n vá»‹ váº­n chuyá»ƒn vÃ  tracking''','''Cần đơn vị vận chuyển và tracking'''),
('''Phiáº¿u tráº£ chÆ°a á»Ÿ tráº¡ng thÃ¡i nháº­n hoÃ n tiá»n''','''Phiếu trả chưa ở trạng thái nhận hoàn tiền'''),
('''Sá»‘ tiá»n hoÃ n vÆ°á»£t sá»‘ cÃ²n pháº£i nháº­n''','''Số tiền hoàn vượt số còn phải nhận'''),
('''HoÃ n tiá»n nhÃ  cung cáº¥p lÃ  ledger báº¥t biáº¿n''','''Hoàn tiền nhà cung cấp là ledger bất biến'''),
('''Tráº¡ng thÃ¡i tráº£ nhÃ  cung cáº¥p chá»‰ Ä‘Æ°á»£c Ä‘á»•i qua Supplier Return workflow''','''Trạng thái trả nhà cung cấp chỉ được đổi qua Supplier Return workflow'''),
('''Lá»‹ch sá»­ phiáº¿u tráº£ Ä‘Ã£ Ä‘Ã³ng lÃ  báº¥t biáº¿n''','''Lịch sử phiếu trả đã đóng là bất biến'''),
('''Chi tiáº¿t phiáº¿u tráº£ Ä‘Ã£ Ä‘Ã³ng lÃ  báº¥t biáº¿n''','''Chi tiết phiếu trả đã đóng là bất biến'''),
('''KhÃ´ng tÃ¬m tháº¥y laptop''','''Không tìm thấy laptop'''),
('''Chi phÃ­ ''','''Chi phí '''),
('''Chi phÃ­ thá»§ cÃ´ng khÃ´ng há»£p lá»‡''','''Chi phí thủ công không hợp lệ'''),
('''Cáº§n nháº­p lÃ½ do void chi phÃ­''','''Cần nhập lý do void chi phí'''),
('''Chá»‰ cÃ³ thá»ƒ void chi phÃ­ thá»§ cÃ´ng Ä‘ang hoáº¡t Ä‘á»™ng''','''Chỉ có thể void chi phí thủ công đang hoạt động'''),
('''Snapshot giÃ¡ vá»‘n cá»§a Ä‘Æ¡n hÃ ng chá»‰ Ä‘Æ°á»£c táº¡o tá»± Ä‘á»™ng khi chá»‘t bÃ¡n''','''Snapshot giá vốn của đơn hàng chỉ được tạo tự động khi chốt bán'''),
('''Lá»‹ch sá»­ cáº¥u pháº§n giÃ¡ vá»‘n lÃ  báº¥t biáº¿n''','''Lịch sử cấu phần giá vốn là bất biến'''),
('''Cáº¥u pháº§n giÃ¡ vá»‘n há»‡ thá»‘ng lÃ  báº¥t biáº¿n''','''Cấu phần giá vốn hệ thống là bất biến'''),
('''Chi phÃ­ thá»§ cÃ´ng chá»‰ Ä‘Æ°á»£c void qua workflow giÃ¡ vá»‘n''','''Chi phí thủ công chỉ được void qua workflow giá vốn'''),
('''0â€“7 ngÃ y''','''0–7 ngày'''),
('''8â€“15 ngÃ y''','''8–15 ngày'''),
('''16â€“30 ngÃ y''','''16–30 ngày'''),
('''31â€“60 ngÃ y''','''31–60 ngày'''),
('''61â€“90 ngÃ y''','''61–90 ngày'''),
('''90+ ngÃ y''','''90+ ngày'''),
('''TÃ i khoáº£n tiá»n khÃ´ng tá»“n táº¡i hoáº·c sai loáº¡i tiá»n''','''Tài khoản tiền không tồn tại hoặc sai loại tiền'''),
('''Giao dá»‹ch khÃ´ng Ä‘Æ°á»£c trÆ°á»›c thá»i Ä‘iá»ƒm opening balance''','''Giao dịch không được trước thời điểm opening balance'''),
('''ThÃ´ng tin tÃ i khoáº£n khÃ´ng há»£p lá»‡''','''Thông tin tài khoản không hợp lệ'''),
('''Giao dá»‹ch thá»§ cÃ´ng khÃ´ng há»£p lá»‡''','''Giao dịch thủ công không hợp lệ'''),
('''Transfer khÃ´ng há»£p lá»‡''','''Transfer không hợp lệ'''),
('''KhÃ´ng tÃ¬m tháº¥y tÃ i khoáº£n''','''Không tìm thấy tài khoản'''),
('''ThÃ´ng tin Ä‘á»‘i soÃ¡t khÃ´ng há»£p lá»‡''','''Thông tin đối soát không hợp lệ'''),
('''Idempotency key Ä‘Ã£ dÃ¹ng cho tÃ i khoáº£n khÃ¡c''','''Idempotency key đã dùng cho tài khoản khác'''),
('''Thanh toÃ¡n Ä‘Æ¡n #''','''Thanh toán đơn #'''),
('''ÄÆ¡n hÃ ng khÃ´ng cÃ³ COD há»£p lá»‡''','''Đơn hàng không có COD hợp lệ'''),
('''ÄÆ¡n hÃ ng khÃ´ng cÃ²n khoáº£n COD pháº£i thu''','''Đơn hàng không còn khoản COD phải thu'''),
('''KhÃ´ng tÃ¬m tháº¥y COD''','''Không tìm thấy COD'''),
('''COD Ä‘Ã£ giao - chuyá»ƒn nghÄ©a vá»¥ pháº£i thu sang Ä‘Æ¡n vá»‹ váº­n chuyá»ƒn''','''COD đã giao - chuyển nghĩa vụ phải thu sang đơn vị vận chuyển'''),
('''Chuyá»ƒn tráº¡ng thÃ¡i COD khÃ´ng há»£p lá»‡''','''Chuyển trạng thái COD không hợp lệ'''),
('''COD chÆ°a á»Ÿ tráº¡ng thÃ¡i nháº­n Ä‘á»‘i soÃ¡t''','''COD chưa ở trạng thái nhận đối soát'''),
('''Sá»‘ tiá»n COD vÆ°á»£t khoáº£n cÃ²n pháº£i thu''','''Số tiền COD vượt khoản còn phải thu'''),
('''Account transaction lÃ  ledger báº¥t biáº¿n; hÃ£y táº¡o giao dá»‹ch Ä‘iá»u chá»‰nh''','''Account transaction là ledger bất biến; hãy tạo giao dịch điều chỉnh'''),
('''TÃªn tÃ i khoáº£n khÃ´ng há»£p lá»‡''','''Tên tài khoản không hợp lệ'''),
('''TÃ i khoáº£n Ä‘Ã£ cÃ³ giao dá»‹ch; chá»‰ Ä‘Æ°á»£c ngá»«ng sá»­ dá»¥ng sau khi xÃ¡c nháº­n sá»‘ dÆ° vÃ  chuyá»ƒn tiá»n''','''Tài khoản đã có giao dịch; chỉ được ngừng sử dụng sau khi xác nhận số dư và chuyển tiền'''),
('''Thanh toÃ¡n lÃ´ #''','''Thanh toán lô #'''),
('''HoÃ n tiá»n nhÃ  cung cáº¥p''','''Hoàn tiền nhà cung cấp'''),
('''HÃ£ng vÃ  model lÃ  báº¯t buá»™c''','''Hãng và model là bắt buộc'''),
('''Trade-in khÃ´ng thá»ƒ báº¯t Ä‘áº§u inspection''','''Trade-in không thể bắt đầu inspection'''),
('''KhÃ´ng tÃ¬m tháº¥y inspection''','''Không tìm thấy inspection'''),
('''Káº¿t quáº£ inspection khÃ´ng há»£p lá»‡''','''Kết quả inspection không hợp lệ'''),
('''Checklist khÃ´ng há»£p lá»‡''','''Checklist không hợp lệ'''),
('''Tá»« chá»‘i: ''','''Từ chối: '''),
('''Trade-in khÃ´ng thá»ƒ tá»« chá»‘i''','''Trade-in không thể từ chối'''),
('''KhÃ´ng tÃ¬m tháº¥y trade-in''','''Không tìm thấy trade-in'''),
('''Chá»‰ trade-in ACCEPTED Ä‘Æ°á»£c nháº­n''','''Chỉ trade-in ACCEPTED được nhận'''),
('''Laptop khÃ´ng Ä‘á»§ Ä‘iá»u kiá»‡n giá»¯ mÃ¡y''','''Laptop không đủ điều kiện giữ máy'''),
('''Thá»i háº¡n giá»¯ mÃ¡y khÃ´ng há»£p lá»‡''','''Thời hạn giữ máy không hợp lệ'''),
('''KhÃ´ng tÃ¬m tháº¥y reservation''','''Không tìm thấy reservation'''),
('''Chá»‰ reservation ACTIVE Ä‘Æ°á»£c há»§y''','''Chỉ reservation ACTIVE được hủy'''),
('''KhÃ´ng thá»ƒ gia háº¡n reservation''','''Không thể gia hạn reservation'''),
('''Reservation khÃ´ng cÃ²n hiá»‡u lá»±c''','''Reservation không còn hiệu lực'''),
('''Cáº§n draft order há»£p lá»‡ Ä‘á»ƒ chuyá»ƒn Ä‘á»•i''','''Cần draft order hợp lệ để chuyển đổi'''),
('''GiÃ¡ trá»‹ thá»a thuáº­n pháº£i lá»›n hÆ¡n 0''','''Giá trị thỏa thuận phải lớn hơn 0'''),
('''Trade-in chÆ°a sáºµn sÃ ng cháº¥p nháº­n''','''Trade-in chưa sẵn sàng chấp nhận'''),
('''Order khÃ´ng há»£p lá»‡''','''Order không hợp lệ'''),
('''Trade-in credit vÆ°á»£t nghÄ©a vá»¥ khÃ¡ch hÃ ng''','''Trade-in credit vượt nghĩa vụ khách hàng'''),
('''Trade-in chÆ°a Ä‘Æ°á»£c nháº­n há»£p lá»‡''','''Trade-in chưa được nhận hợp lệ'''),
('''Thu cÅ© Ä‘á»•i má»›i ''','''Thu cũ đổi mới '''),
('''Commission chá»‰ táº¡o cho sale Ä‘Ã£ committed vÃ  cÃ³ snapshot''','''Commission chỉ tạo cho sale đã committed và có snapshot'''),
('''Commission khÃ´ng á»Ÿ tráº¡ng thÃ¡i PENDING''','''Commission không ở trạng thái PENDING'''),
('''KhÃ´ng tÃ¬m tháº¥y commission''','''Không tìm thấy commission'''),
('''Commission chÆ°a Ä‘Æ°á»£c duyá»‡t''','''Commission chưa được duyệt'''),
('''Chi hoa há»“ng order #''','''Chi hoa hồng order #'''),
('''Commission Ä‘Ã£ duyá»‡t/chi khÃ´ng thá»ƒ xÃ³a''','''Commission đã duyệt/chi không thể xóa'''),
('''Commission Ä‘Ã£ duyá»‡t lÃ  báº¥t biáº¿n''','''Commission đã duyệt là bất biến'''),
('''Commission Ä‘Ã£ chi khÃ´ng thá»ƒ Ä‘á»•i tráº¡ng thÃ¡i''','''Commission đã chi không thể đổi trạng thái'''),
('''Tá»± Ä‘á»™ng há»§y do order ''','''Tự động hủy do order '''),
('''Laptop Ä‘ang Ä‘Æ°á»£c giá»¯ cho reservation khÃ¡c''','''Laptop đang được giữ cho reservation khác'''),
('''Trade-in Ä‘Ã£ cam káº¿t kinh táº¿ khÃ´ng thá»ƒ xÃ³a''','''Trade-in đã cam kết kinh tế không thể xóa'''),
('''Trade-in pháº£i hoÃ n táº¥t inspection trÆ°á»›c khi cháº¥p nháº­n''','''Trade-in phải hoàn tất inspection trước khi chấp nhận'''),
('''Nguá»“n kinh táº¿ trade-in Ä‘Ã£ cam káº¿t lÃ  báº¥t biáº¿n''','''Nguồn kinh tế trade-in đã cam kết là bất biến'''),
('''Tiá»n Ä‘Ã£ thu vÃ  credit thu cÅ© vÆ°á»£t giÃ¡ bÃ¡n''','''Tiền đã thu và credit thu cũ vượt giá bán'''),
('''Tráº¡ng thÃ¡i báº£o hÃ nh khÃ´ng há»£p lá»‡''','''Trạng thái bảo hành không hợp lệ'''),
('''Phiáº¿u báº£o hÃ nh pháº£i gáº¯n vá»›i laptop''','''Phiếu bảo hành phải gắn với laptop'''),
('''KhÃ´ng thá»ƒ Ä‘á»•i mÃ¡y gá»‘c cá»§a phiáº¿u báº£o hÃ nh''','''Không thể đổi máy gốc của phiếu bảo hành'''),
('''ÄÆ¡n gá»‘c khÃ´ng thuá»™c mÃ¡y Ä‘ang tiáº¿p nháº­n báº£o hÃ nh''','''Đơn gốc không thuộc máy đang tiếp nhận bảo hành'''),
('''Tráº¡ng thÃ¡i laptop chá»‰ Ä‘Æ°á»£c thay Ä‘á»•i qua workflow nghiá»‡p vá»¥''','''Trạng thái laptop chỉ được thay đổi qua workflow nghiệp vụ'''),
('''LÃ´ mua pháº£i cÃ³ tá»« 1 Ä‘áº¿n 200 mÃ¡y''','''Lô mua phải có từ 1 đến 200 máy'''),
('''NhÃ  cung cáº¥p khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ ngá»«ng sá»­ dá»¥ng''','''Nhà cung cấp không tồn tại hoặc đã ngừng sử dụng'''),
('''Tá»· giÃ¡ mua khÃ´ng há»£p lá»‡''','''Tỷ giá mua không hợp lệ'''),
('''ThÃ´ng tin mÃ¡y trong lÃ´ khÃ´ng há»£p lá»‡''','''Thông tin máy trong lô không hợp lệ'''),
('''Äá»£t nháº­n hÃ ng khÃ´ng há»£p lá»‡''','''Đợt nhận hàng không hợp lệ'''),
('''Danh sÃ¡ch nháº­n hÃ ng cÃ³ mÃ¡y bá»‹ trÃ¹ng''','''Danh sách nhận hàng có máy bị trùng'''),
('''MÃ¡y khÃ´ng thuá»™c luá»“ng mua tá»« nhÃ  cung cáº¥p''','''Máy không thuộc luồng mua từ nhà cung cấp'''),
('''MÃ¡y % khÃ´ng cÃ²n á»Ÿ tráº¡ng thÃ¡i chÆ°a vá» hÃ ng''','''Máy % không còn ở trạng thái chưa về hàng'''),
('''Nháº­n hÃ ng tá»« lÃ´ ''','''Nhận hàng từ lô '''),
('''TÃªn mÃ¡y khÃ´ng há»£p lá»‡''','''Tên máy không hợp lệ'''),
('''Nháº­n mÃ¡y chÆ°a rÃµ nguá»“n''','''Nhận máy chưa rõ nguồn'''),
('''Hai laptop pháº£i khÃ¡c nhau''','''Hai laptop phải khác nhau'''),
('''Laptop thá»±c nháº­n khÃ´ng cÃ²n lÃ  mÃ¡y chÆ°a rÃµ nguá»“n Ä‘ang chá» QC''','''Laptop thực nhận không còn là máy chưa rõ nguồn đang chờ QC'''),
('''Laptop dá»± kiáº¿n khÃ´ng cÃ²n nguyÃªn tráº¡ng chÆ°a vá» hÃ ng''','''Laptop dự kiến không còn nguyên trạng chưa về hàng'''),
('''Laptop dá»± kiáº¿n Ä‘Ã£ cÃ³ lá»‹ch sá»­ nghiá»‡p vá»¥, khÃ´ng thá»ƒ gá»™p''','''Laptop dự kiến đã có lịch sử nghiệp vụ, không thể gộp'''),
('''Cáº§n nháº­p lÃ½ do bá» qua''','''Cần nhập lý do bỏ qua'''),
('''MÃ¡y khÃ´ng cÃ²n á»Ÿ tráº¡ng thÃ¡i cÃ³ thá»ƒ bá» qua''','''Máy không còn ở trạng thái có thể bỏ qua'''),
('''KhÃ´ng tÃ¬m tháº¥y sáº£n pháº©m tráº£''','''Không tìm thấy sản phẩm trả'''),
('''Phiáº¿u tráº£ chÆ°a chá» replacement''','''Phiếu trả chưa chờ replacement'''),
('''Laptop replacement khÃ´ng há»£p lá»‡''','''Laptop replacement không hợp lệ'''),
('''Replacement khÃ´ng cÃ¹ng nhÃ  cung cáº¥p''','''Replacement không cùng nhà cung cấp'''),
('''Laptop Ä‘Ã£ bÃ¡n: dá»¯ liá»‡u mua hÃ ng lÃ  báº¥t biáº¿n''','''Laptop đã bán: dữ liệu mua hàng là bất biến'''),
('''Laptop Ä‘ang tráº£ NCC vÃ  Ä‘Ã£ phÃ¡t sinh tÃ i chÃ­nh''','''Laptop đang trả NCC và đã phát sinh tài chính'''),
('''Tráº¡ng thÃ¡i laptop khÃ´ng cho phÃ©p sá»­a dá»¯ liá»‡u mua hÃ ng''','''Trạng thái laptop không cho phép sửa dữ liệu mua hàng'''),
('''PhÃ¢n loáº¡i mÃ¡y khÃ´ng há»£p lá»‡''','''Phân loại máy không hợp lệ'''),
('''GiÃ¡ mua khÃ´ng há»£p lá»‡''','''Giá mua không hợp lệ'''),
('''PhÃ­ váº­n chuyá»ƒn khÃ´ng há»£p lá»‡''','''Phí vận chuyển không hợp lệ'''),
('''GiÃ¡ nháº­p VNÄ khÃ´ng há»£p lá»‡''','''Giá nhập VNĐ không hợp lệ'''),
('''MÃ£ váº­n chuyá»ƒn Ä‘Ã£ Ä‘Æ°á»£c dÃ¹ng cho laptop khÃ¡c''','''Mã vận chuyển đã được dùng cho laptop khác'''),
('''LÃ´ mua Ä‘Ã­ch khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ ngá»«ng sá»­ dá»¥ng''','''Lô mua đích không tồn tại hoặc đã ngừng sử dụng'''),
('''KhÃ´ng thá»ƒ chuyá»ƒn lÃ´ sau khi lÃ´ nguá»“n Ä‘Ã£ phÃ¡t sinh thanh toÃ¡n NCC''','''Không thể chuyển lô sau khi lô nguồn đã phát sinh thanh toán NCC''')
) AS messages(broken,fixed) LOOP
      repaired := replace(repaired, mapping.broken, mapping.fixed);
    END LOOP;
    IF repaired IS DISTINCT FROM original THEN EXECUTE repaired; END IF;
  END LOOP;
END $repair$;
COMMIT;
