const pad = (n) => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const addDays = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// "09:30:00" or "2026-03-10T09:30:00" -> "9:30 ص"
export function clock(v) {
  if (!v) return '';
  const t = v.includes('T') ? v.split('T')[1] : v;
  let [h, m] = t.split(':').map(Number);
  const suffix = h < 12 ? 'ص' : 'م';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${suffix}`;
}
export const dayName = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('ar-EG', { weekday: 'short' });
export const dateLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
export const holdLabel = (s) => (s >= 60 ? `${Math.round(s / 60)} د` : `${s} ث`);
export const ageFrom = (birthYear) => (birthYear ? new Date().getFullYear() - birthYear : null);

export const STATE_LABEL = {
  upcoming: 'لسه مافتحش', open: 'متاح دلوقتي', late: 'متأخر – آخر فرصة', closed: 'اتقفل', done: 'اتعمل ✓',
};
export const DAY_LABEL = {
  done: 'خلّص', missed: 'فوّت', rest: 'يوم راحة (ألم)', restored: 'اتسترجع', pending: 'النهارده', none: 'مفيش تمارين',
};
