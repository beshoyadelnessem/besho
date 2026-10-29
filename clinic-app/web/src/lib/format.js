import { LOCALE } from '../i18n.js';

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDay(new Date());
export const addDays = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };

// "09:30:00" or "2026-03-10T09:30:00" (clinic local time) -> "9:30 AM" in the UI language
export function clock(v, lang) {
  if (!v) return '';
  const t = v.includes('T') ? v.split('T')[1] : v;
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(LOCALE[lang], { hour: 'numeric', minute: '2-digit' });
}
export const dayName = (iso, lang) => new Date(iso + 'T12:00:00').toLocaleDateString(LOCALE[lang], { weekday: 'long' });
export const dateLabel = (iso, lang) => new Date(iso + 'T12:00:00').toLocaleDateString(LOCALE[lang], { day: 'numeric', month: 'long' });
export const dateTime = (ts, lang) => new Date(ts).toLocaleString(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const holdLabel = (s, lang) => (s >= 60 ? `${Math.round(s / 60)} ${lang === 'ar' ? 'د' : 'min'}` : `${s} ${lang === 'ar' ? 'ث' : 's'}`);
export const ageFrom = (birthYear) => (birthYear ? new Date().getFullYear() - birthYear : null);
export const dayNum = (iso) => Number(iso.slice(8));
