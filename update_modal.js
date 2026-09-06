const fs = require('fs');

const formContent = `
            <form onSubmit={handleSubmitForm}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px' }}>
                
                {/* ROW 1: 4 fields (3 cols each) */}
                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>1. Ngày Tạo Đơn</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={toYMD(formData.createdDate)} 
                    onChange={e => setFormData({ ...formData, createdDate: toVnFormat(e.target.value) })} 
                    required 
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>SALE Online</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('saleOnline', formData.saleOnline) || ''} 
                    onChange={e => setFormData({ ...formData, saleOnline: e.target.value })}
                  >
                    {saleOnlines.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>SALE Offline</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('saleOffline', formData.saleOffline) || ''} 
                    onChange={e => setFormData({ ...formData, saleOffline: e.target.value })}
                  >
                    <option value="">-- Chọn Sale --</option>
                    {SALE_OFFLINE_OPTIONS && SALE_OFFLINE_OPTIONS.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#8b5cf6' }}>Loại Đơn Hàng</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('orderType', formData.orderType) || ''} 
                    onChange={e => setFormData({ ...formData, orderType: e.target.value })}
                  >
                    {orderTypes.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                {formData.orderType === 'Thu cũ đổi mới (Trade-in)' && (
                  <>
                    <div className="form-group" style={{ gridColumn: 'span 6' }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Tên Máy Khách Bán (Trade-in)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={formData.tradeInLaptopName} 
                        onChange={e => setFormData({ ...formData, tradeInLaptopName: e.target.value })} 
                        placeholder="VD: Thinkpad T480s i5..."
                        required 
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: 'span 6' }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#10b981' }}>Giá Nhập Trade-in (triệu VNĐ)</label>
                      <input 
                        type="number" 
                        step="any" 
                        className="form-control" 
                        value={formData.tradeInPrice} 
                        onChange={e => setFormData({ ...formData, tradeInPrice: e.target.value })} 
                        placeholder="VD: 5.5"
                        required 
                      />
                    </div>
                  </>
                )}

                {/* ROW 2: 2 fields (6 cols each) */}
                <div className="form-group" style={{ gridColumn: 'span 6' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#2563eb' }}>Máy Trong Kho (ID & Cấu hình)</label>
                  <select 
                    className="form-control" 
                    value={formData.laptopId || ''} 
                    onChange={e => setFormData({ ...formData, laptopId: e.target.value ? parseInt(e.target.value, 10) : null })}
                  >
                    <option value="">-- Chưa chọn / chưa gán máy --</option>
                    {laptops.filter(l => l.status === 'Sẵn hàng (đã nhập kho)' || l.id === formData.laptopId).map(l => (
                      <option key={l.id} value={l.id}>
                        {l.id} - {l.product_name} {l.specs ? \`(\${l.specs})\` : ''} - Nhập: {l.import_price_vnd ? l.import_price_vnd + 'tr' : 'N/A'} - Lẻ: {l.retail_price ? l.retail_price + 'tr' : 'N/A'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 6' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Ghi Chú Đơn Hàng</label>
                  <textarea 
                    className="form-control" 
                    value={formData.note} 
                    onChange={e => setFormData({ ...formData, note: e.target.value })} 
                    placeholder="Ghi chú chi tiết cho đơn hàng..."
                    rows={2}
                  />
                </div>

                {/* ROW 3: 4 fields (3 cols each) */}
                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Trạng Thái Đơn Hàng</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('orderStatus', formData.orderStatus) || ''} 
                    onChange={e => setFormData({ ...formData, orderStatus: e.target.value })}
                  >
                    {orderStatuses.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Trạng Thái Thanh Toán</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('paymentStatus', formData.paymentStatus) || ''} 
                    onChange={e => setFormData({ ...formData, paymentStatus: e.target.value })}
                  >
                    {paymentStatuses.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#db2777' }}>Phương Thức TT</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('paymentMethod', formData.paymentMethod) || ''} 
                    onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                  >
                    {paymentMethods.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Trạng Thái Giao Hàng</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('deliveryStatus', formData.deliveryStatus) || ''} 
                    onChange={e => setFormData({ ...formData, deliveryStatus: e.target.value })}
                  >
                    {deliveryStatuses.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                {/* ROW 4: 3 fields (4 cols each) */}
                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#2563eb' }}>Giá Bán Thực Tế (triệu VNĐ)</label>
                  <input 
                    type="number" 
                    step="any" 
                    className="form-control" 
                    value={formData.salePrice} 
                    onChange={e => setFormData({ ...formData, salePrice: e.target.value })} 
                    placeholder="VD: 17.5"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#d97706' }}>Thông Tin Cọc</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.depositNote} 
                    onChange={e => setFormData({ ...formData, depositNote: e.target.value })} 
                    placeholder="VD: 500k VCB"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 4' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#059669' }}>Thu Hộ COD (triệu VNĐ)</label>
                  <input 
                    type="number" 
                    step="any" 
                    className="form-control" 
                    value={formData.codAmount} 
                    onChange={e => setFormData({ ...formData, codAmount: e.target.value })} 
                    placeholder="VD: 17.0"
                  />
                </div>

                {/* ROW 5: 4 fields (3 cols each) */}
                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Phương Thức Gửi Hàng</label>
                  <select 
                    className="form-control" 
                    value={labelToKey('shippingMethod', formData.shippingMethod) || ''} 
                    onChange={e => setFormData({ ...formData, shippingMethod: e.target.value })}
                  >
                    {shippingMethods.map(o => (<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Mã Vận Đơn (ViettelPost...)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.trackingCode} 
                    onChange={e => setFormData({ ...formData, trackingCode: e.target.value })} 
                    placeholder="VD: VT9988112233"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Ngày Gửi Hàng Thực Tế</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={toYMD(formData.shipDate)} 
                    onChange={e => setFormData({ ...formData, shipDate: toVnFormat(e.target.value) })} 
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Ghi Chú Yêu Cầu Của Khách</label>
                  <textarea 
                    className="form-control" 
                    value={formData.setupNote} 
                    onChange={e => setFormData({ ...formData, setupNote: e.target.value })} 
                    placeholder="VD: Giao giờ hành chính..."
                    rows={1}
                  />
                </div>

                {/* ROW 6: 4 fields (3 cols each) */}
                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Khách Hàng</label>
                    <button type="button" onClick={() => {/* TODO: Open customer modal if exists */}} style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>+ Thêm mới</button>
                  </div>
                  <select 
                    className="form-control" 
                    value={formData.customerId || ''} 
                    onChange={e => setFormData({ ...formData, customerId: e.target.value ? parseInt(e.target.value, 10) : null })}
                  >
                    <option value="">-- Chọn khách hàng --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? \` - \${c.phone}\` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Yêu Cầu Cài Đặt</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.softwareRequirements} 
                    onChange={e => setFormData({ ...formData, softwareRequirements: e.target.value })} 
                    placeholder="Cài cơ bản"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Thời Gian Bảo Hành</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.warranty} 
                    onChange={e => setFormData({ ...formData, warranty: e.target.value })} 
                    placeholder="6 tháng"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 3' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569' }}>Quà Tặng Kèm</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formData.gifts} 
                    onChange={e => setFormData({ ...formData, gifts: e.target.value })} 
                    placeholder="Chuột, lót, balo"
                  />
                </div>

              </div>

              <div className="form-actions" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Đang lưu...' : 'Lưu Đơn Hàng'}
                </button>
              </div>
            </form>
`;

let orderJsx = fs.readFileSync('components/pages/Orders.jsx', 'utf8');

// Replace form inside <div className="modal-backdrop active">
const modalStartStr = '<form onSubmit={handleSubmitForm}>';
const modalEndStr = '</form>';

let startIndex = orderJsx.indexOf(modalStartStr);
if (startIndex !== -1) {
  let endIndex = orderJsx.indexOf(modalEndStr, startIndex) + modalEndStr.length;
  orderJsx = orderJsx.substring(0, startIndex) + formContent + orderJsx.substring(endIndex);
  
  // Also change the max-width of the modal to be wider
  orderJsx = orderJsx.replace(/<div className="modal-box glass" style={{ maxWidth: '850px' }}>/g, '<div className="modal-box glass" style={{ maxWidth: "1200px" }}>');
  
  // also add SALE_OFFLINE_OPTIONS to imports
  if (!orderJsx.includes('SALE_OFFLINE_OPTIONS')) {
      orderJsx = orderJsx.replace('SALE_ONLINE_OPTIONS,', 'SALE_ONLINE_OPTIONS,\n    SALE_OFFLINE_OPTIONS,');
  }

  // change default state of formData in Orders.jsx
  orderJsx = orderJsx.replace(/discountAmount: '',/g, 'saleOffline: \'\',');

  fs.writeFileSync('components/pages/Orders.jsx', orderJsx);
  console.log('Orders.jsx modified successfully!');
} else {
  console.log('Could not find form string to replace.');
}

