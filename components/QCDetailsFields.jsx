'use client';
import { QC_FIELDS, QC_GROUPS, QC_RESULTS } from '@/lib/qcDetails';
export default function QCDetailsFields({ value = {}, onChange, disabled = false }) {
  const fieldResult = ([key,,linkedKeys = []]) => {
    const results = [key, ...linkedKeys].map(fieldKey => value[fieldKey]?.result).filter(Boolean);
    if (results.includes('FAIL')) return 'FAIL';
    if (results.includes('PASS')) return 'PASS';
    return '';
  };
  const change = ([key,,linkedKeys = []], result) => onChange(Object.fromEntries([
    ...Object.entries(value),
    ...[key, ...linkedKeys].map(fieldKey => [fieldKey, { ...value[fieldKey], result: result || 'NOT_TESTED' }]),
  ]));
  const tested = QC_FIELDS.filter(field => ['PASS','FAIL'].includes(fieldResult(field))).length;
  const markAll = result => onChange(Object.fromEntries([
    ...Object.entries(value),
    ...QC_FIELDS.flatMap(([key,,linkedKeys = []]) => [key, ...linkedKeys].map(fieldKey => [fieldKey, { ...value[fieldKey], result }])),
  ]));
  return <fieldset disabled={disabled} className="qc-detail-fields">
    <div className="qc-detail-toolbar">
      <div><strong>Chi tiết kiểm tra</strong><span>{tested}/{QC_FIELDS.length} mục đã đánh giá</span></div>
      <div className="qc-detail-progress"><i style={{ width: `${Math.round(tested / QC_FIELDS.length * 100)}%` }} /></div>
      {!disabled && <div className="qc-detail-actions"><button type="button" onClick={() => markAll('PASS')}>Đạt tất cả</button><button type="button" onClick={() => markAll('NOT_TESTED')}>Đặt lại</button></div>}
    </div>
    <div className="qc-detail-groups">{QC_GROUPS.map(group => <section className="qc-detail-group" key={group.key}>
      <h3>{group.label}{(group.fields || []).length > 0 && <span>{group.fields.filter(field => ['PASS','FAIL'].includes(fieldResult(field))).length}/{group.fields.length}</span>}</h3>
      <div className="qc-detail-grid">{(group.inputs || []).map(([key,label]) => <div key={key} className="qc-detail-item qc-detail-text">
        <label><span>{label}</span><input type="text" inputMode={key === 'batteryHealth' ? 'numeric' : 'text'} aria-label={label} placeholder={key === 'batteryHealth' ? '0–100' : 'Nhập serial'} value={value[key] ?? ''} onChange={e => onChange({ ...value, [key]: e.target.value })} /></label>
      </div>)}{(group.fields || []).map(field => { const [key,label] = field; const result = fieldResult(field); return <div key={key} className={`qc-detail-item result-${result || 'EMPTY'}`}>
        <label><span>{label}</span><select aria-label={label} value={result} onChange={e => change(field, e.target.value)}>{Object.entries(QC_RESULTS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>})}</div>
    </section>)}</div>
  </fieldset>;
}
