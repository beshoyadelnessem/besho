import { useEffect, useMemo, useRef, useState } from 'react';
import { POSES } from '../figure/poses.js';
import { drawScene, lookFor } from '../figure/rig.js';
import { LANGS, SPEECH, errorKey, useI18n } from '../i18n.js';
import { ageFrom, dateLabel, dayNum } from '../lib/format.js';

export const lookOf = (p) => lookFor({ gender: p?.gender, hijab: p?.avatar?.hijab, age: ageFrom(p?.birth_year) });

const sceneMarkup = (slug, look, t) => {
  const ex = POSES[slug];
  if (!ex) return '';
  return `<svg viewBox="${(ex.view || [0, 0, 720, 480]).join(' ')}" aria-hidden="true">${drawScene(ex, t, look)}</svg>`;
};

// Animated exercise figure. `phase(now) -> t` lets the caller drive the motion;
// otherwise it loops gently. Static when the viewer prefers reduced motion.
export function Figure({ slug, look, phase, still = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || reduce) { el.innerHTML = sceneMarkup(slug, look, still ? 0.85 : 1); return undefined; }
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const t = phase ? phase(now) : (1 - Math.cos(((now - t0) / 1600) * Math.PI)) / 2;
      el.innerHTML = sceneMarkup(slug, look, t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slug, look, phase, still]);
  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}

export function Caution({ title, children }) {
  const { t } = useI18n();
  return (
    <div className="caution" role="alert">
      <span className="ic" aria-hidden="true">!</span>
      <div><b>{title || t('caution')}</b>{children}</div>
    </div>
  );
}

export function useError() {
  const { t } = useI18n();
  const [error, setError] = useState('');
  const show = (e) => { if (!e) return setError(''); const k = errorKey(e.message || e); setError(k ? t(k) : (e.message || String(e))); };
  return [error, show];
}
export const ErrorBox = ({ error }) => (error ? <div className="error" role="alert">{error}</div> : null);

export function LangSwitch({ value, onChange }) {
  const { t } = useI18n();
  return (
    <label className="lang">
      <span className="sr">{t('language')}</span>
      <select id="lang-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('language')}>
        {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
    </label>
  );
}

// Reads text aloud with the browser's speech engine, in the UI language.
export function ReadAloud({ parts }) {
  const { t, lang } = useI18n();
  const [on, setOn] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (!('speechSynthesis' in window)) return null;
  const toggle = () => {
    const s = window.speechSynthesis;
    if (on) { s.cancel(); setOn(false); return; }
    const code = SPEECH[lang];
    const voice = s.getVoices().find((v) => v.lang?.toLowerCase().startsWith(code.slice(0, 2)));
    if (!voice && s.getVoices().length) setNote(t('noVoice')); else setNote('');
    s.cancel();
    const u = new SpeechSynthesisUtterance(parts.filter(Boolean).join('. '));
    u.lang = code; if (voice) u.voice = voice; u.rate = 0.9;
    u.onend = () => setOn(false); u.onerror = () => setOn(false);
    s.speak(u); setOn(true);
  };
  return (
    <div className="row">
      <button type="button" className="btn ghost" onClick={toggle}>{on ? t('stopListen') : t('listen')}</button>
      {note && <span className="small muted">{note}</span>}
    </div>
  );
}

export function DayStrip({ days }) {
  const { t, lang } = useI18n();
  return (
    <div className="days" style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 14)}, 1fr)` }}>
      {days.map((d) => <span key={d.day} className={d.status} title={`${dateLabel(d.day, lang)}: ${t('day_' + d.status)}`}>{dayNum(d.day)}</span>)}
    </div>
  );
}

// Small line chart of daily 0–10 pain scores over a date range.
export function PainChart({ scores, from, days = 28 }) {
  const { lang } = useI18n();
  const W = 560, Hh = 150, padX = 26, padY = 14;
  const pts = useMemo(() => scores.map((s) => {
    const i = Math.round((new Date(s.day) - new Date(from)) / 864e5);
    return [padX + (i / (days - 1)) * (W - padX * 2), padY + (1 - s.score / 10) * (Hh - padY * 2), s];
  }), [scores, from, days]);
  if (!scores.length) return null;
  const last = pts[pts.length - 1];
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <svg className="chart" style={{ direction: 'ltr' }} viewBox={`0 0 ${W} ${Hh + 18}`} role="img" aria-label="pain score chart">
      {[0, 5, 10].map((v) => {
        const y = padY + (1 - v / 10) * (Hh - padY * 2);
        return <g key={v}><line x1={padX} x2={W - padX} y1={y} y2={y} stroke="var(--line)" /><text x={4} y={y + 4} fontSize="11" fill="var(--muted)">{v}</text></g>;
      })}
      <polyline points={`${pts[0][0]},${Hh - padY} ${line} ${last[0]},${Hh - padY}`} fill="var(--flame-soft)" stroke="none" />
      <polyline points={line} fill="none" stroke="var(--flame)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="5" fill="var(--flame)" />
      <text x={last[0]} y={last[1] - 9} fontSize="12" fontWeight="800" fill="var(--ink)" textAnchor="middle">{last[2].score}</text>
      <text x={padX} y={Hh + 14} fontSize="11" fill="var(--muted)">{dateLabel(from, lang)}</text>
    </svg>
  );
}

export const Logo = () => (
  <div className="logo"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" stroke="var(--on-teal)" strokeWidth="4" strokeLinecap="round" /></svg></div>
);
