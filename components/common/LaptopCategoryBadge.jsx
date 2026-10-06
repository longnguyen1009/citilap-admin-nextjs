export default function LaptopCategoryBadge({ category, categories = [] }) {
  const label = categories.find(option => option.option_key === category)?.label || category || '—';
  const text = String(label).toUpperCase();
  const color = text.includes('LEGION 5 PRO') ? 'success'
    : text.includes('LEGION') ? 'danger'
      : text.includes('ROG') ? 'neutral'
        : /ZEPHYRUS|TUF|ASUS|ACER/.test(text) ? 'info' : 'neutral';
  return <span className={`cat-badge pill-badge pill-${color}`}>{label}</span>;
}
