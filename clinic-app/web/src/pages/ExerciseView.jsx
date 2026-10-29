import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { exText, useI18n } from '../i18n.js';
import { Caution, ErrorBox, Figure, ReadAloud, useError } from '../components/ui.jsx';
import { clock, holdLabel } from '../lib/format.js';

export default function ExerciseView({ id, look, library, go }) {
  const { t, lang } = useI18n();
  const [s, setS] = useState(null);
  const [error, setError] = useError();
  const [doneMsg, setDoneMsg] = useState('');
  const [coach, setCoach] = useState(null);
  const [reading, setReading] = useState(null);   // read-aloud part: 0 name, 1 caution, 3.. steps, then tip
  const coachRef = useRef(null);

  useEffect(() => { api.todayPlan().then((p) => setS(p.find((x) => String(x.prescription_id) === String(id)) || false)); }, [id]);
  const ex = s && library.find((e) => e.slug === s.exercise_slug);
  const tx = exText(ex, lang);

  // guided reps: move 1.5 s, hold (at most 10 s shown), return 1.5 s, rest 1.2 s
  const phase = useCallback((now) => {
    const c = coachRef.current;
    if (!c) return null;
    const hold = Math.min(s.hold_sec, 10) * 1000, mv = 1500, rest = 1200, per = mv + hold + mv + rest;
    const e = now - c.start, k = e % per, rep = Math.floor(e / per) + 1, set = Math.floor((rep - 1) / s.reps) + 1;
    if (set > s.sets) { coachRef.current = null; setCoach({ finished: true }); return 0; }
    const r = ((rep - 1) % s.reps) + 1;
    let cue, tt;
    if (k < mv) { cue = t('cueMove'); tt = (1 - Math.cos((k / mv) * Math.PI)) / 2; }
    else if (k < mv + hold) { cue = t('cueHold', { n: Math.ceil((mv + hold - k) / 1000) }); tt = 1; }
    else if (k < 2 * mv + hold) { cue = t('cueBack'); tt = (1 + Math.cos(((k - mv - hold) / mv) * Math.PI)) / 2; }
    else { cue = t('cueRest'); tt = 0; }
    if (c.cue !== cue || c.rep !== r) { c.cue = cue; c.rep = r; c.set = set; setCoach({ ...c }); }
    return tt;
  }, [s, t]);
  const figurePhase = useCallback((now) => {
    const tt = phase(now);
    return tt === null ? (1 - Math.cos((now / 1600) * Math.PI)) / 2 : tt;
  }, [phase]);
  const toggleCoach = () => {
    if (coachRef.current) { coachRef.current = null; setCoach(null); return; }
    coachRef.current = { start: performance.now(), rep: 1, set: 1, cue: '' }; setCoach({ ...coachRef.current });
  };

  const finish = async () => {
    setError(null);
    try {
      const r = await api.complete(s.prescription_id);
      const badges = (r?.new_badges || []).map((k) => t('newBadge', { name: t('badge_' + k) }));
      setDoneMsg([r?.late ? t('doneLate') : t('doneOk'), ...badges].join(' '));
      setS({ ...s, state: 'done' });
    } catch (e) { setError(e); }
  };

  if (s === null) return <div className="page muted">{t('loading')}</div>;
  if (!s || !ex) return <div className="page"><div className="error">{t('notToday')}</div><button className="btn ghost" onClick={() => go('')}>{t('back')}</button></div>;
  const locked = s.state === 'upcoming' || s.state === 'closed';

  return (
    <div className="page">
      <div className="top">
        <button className="btn ghost icon-btn" onClick={() => go('')} aria-label={t('back')}>{lang === 'ar' ? '→' : '←'}</button>
        <div style={{ flex: 1, textAlign: 'center' }}><h1 style={{ fontSize: 20 }}>{tx.name}</h1>{lang !== 'en' && <div className="en">{ex.content.en.name}</div>}</div>
        <span className={`chip ${s.state}`}>{clock(s.opens_at, lang)}</span>
      </div>

      <Caution>{tx.caution}</Caution>
      {s.extra_caution && <Caution title={t('cautionYou')}>{s.extra_caution}</Caution>}

      <div className="stage">
        <Figure slug={ex.slug} look={look} phase={figurePhase} />
        <span className="tag">{t('injured')}</span>
        {coach && !coach.finished && <span className="cue">{t('coachSet', { s: coach.set, S: s.sets, r: coach.rep, R: s.reps })} · {coach.cue}</span>}
        {coach?.finished && <span className="cue">{t('allDone')}</span>}
      </div>

      <div className="dose">
        <div><b>{s.sets}</b><span>{t('sets')}</span></div>
        <div><b>{s.reps}</b><span>{t('reps')}</span></div>
        <div><b>{s.hold_sec ? holdLabel(s.hold_sec, lang) : '—'}</b><span>{t('hold')}</span></div>
      </div>

      <div className="card stack">
        <div className="row spread"><b>{t('steps')}</b><ReadAloud slug={ex.slug} gender={look.female ? 'f' : 'm'} onPart={setReading} /></div>
        <ol className="steps">{tx.steps.map((x, i) => <li key={x} className={reading === i + 3 ? 'reading' : ''}>{x}</li>)}</ol>
        {tx.tip && <div className={`notice small${reading === tx.steps.length + 3 ? ' reading' : ''}`}>💡 {tx.tip}</div>}
      </div>

      <ErrorBox error={error} />
      {doneMsg && <div className="notice" role="status">{doneMsg}</div>}
      {s.state === 'done' ? (
        <button className="btn ghost block" onClick={() => go('')}>{t('doneBack')}</button>
      ) : locked ? (
        <div className="error">{s.state === 'upcoming' ? t('opensAt', { time: clock(s.opens_at, lang) }) : t('closedMsg')}</div>
      ) : (
        <div className="row">
          <button className="btn ghost" style={{ flex: 1 }} onClick={toggleCoach}>{coachRef.current ? t('coachStop') : t('coachStart')}</button>
          <button className="btn" style={{ flex: 1.4 }} onClick={finish}>{t('finish')}</button>
        </div>
      )}
      {s.state === 'late' && <div className="small" style={{ color: 'var(--amber)', fontWeight: 700 }}>{t('graceNote', { time: clock(s.closes_at, lang) })}</div>}
    </div>
  );
}
