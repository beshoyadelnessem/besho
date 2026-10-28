import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import Figure from '../components/Figure.jsx';
import { clock, holdLabel } from '../lib/format.js';

export function Caution({ title = 'تنبيه مهم', children }) {
  return (
    <div className="caution" role="alert">
      <span className="ic" aria-hidden="true">!</span>
      <div><b>{title}</b>{children}</div>
    </div>
  );
}

export default function ExerciseView({ id, look, library, go }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const [coach, setCoach] = useState(null); // { start, rep, set, cue }
  const coachRef = useRef(null);

  useEffect(() => { api.todayPlan().then((p) => setS(p.find((x) => String(x.prescription_id) === String(id)) || false)); }, [id]);
  const ex = s && library.find((e) => e.slug === s.exercise_slug);

  // guided reps: move 1.5 s, hold (max 10 s shown), return 1.5 s, rest 1.2 s
  const phase = useCallback((now) => {
    const c = coachRef.current;
    if (!c) return null;
    const hold = Math.min(s.hold_sec, 10) * 1000, mv = 1500, rest = 1200, per = mv + hold + mv + rest;
    const e = now - c.start, k = e % per, rep = Math.floor(e / per) + 1, set = Math.floor((rep - 1) / s.reps) + 1;
    if (set > s.sets) { coachRef.current = null; setCoach({ finished: true }); return 0; }
    const r = ((rep - 1) % s.reps) + 1;
    let cue, t;
    if (k < mv) { cue = 'ببطء...'; t = (1 - Math.cos((k / mv) * Math.PI)) / 2; }
    else if (k < mv + hold) { cue = `اثبت ${Math.ceil((mv + hold - k) / 1000)}`; t = 1; }
    else if (k < 2 * mv + hold) { cue = 'ارجع ببطء'; t = (1 + Math.cos(((k - mv - hold) / mv) * Math.PI)) / 2; }
    else { cue = 'ارتاح'; t = 0; }
    if (c.cue !== cue || c.rep !== r) { c.cue = cue; c.rep = r; c.set = set; setCoach({ ...c }); }
    return t;
  }, [s]);
  const figurePhase = useCallback((now) => {
    const t = phase(now);
    return t === null ? (1 - Math.cos((now / 1600) * Math.PI)) / 2 : t;
  }, [phase]);
  const toggleCoach = () => {
    if (coachRef.current) { coachRef.current = null; setCoach(null); return; }
    coachRef.current = { start: performance.now(), rep: 1, set: 1, cue: '' }; setCoach({ ...coachRef.current });
  };

  const finish = async () => {
    setError('');
    try {
      const r = await api.complete(s.prescription_id);
      setDoneMsg(r?.late ? 'اتسجل، بس كان متأخر. حاول تلتزم بالمعاد المرة الجاية.' : 'برافو! اتسجل في معاده 🔥');
      setS({ ...s, state: 'done' });
    } catch (e) { setError(e.message); }
  };

  if (s === null) return <div className="page muted">بيحمّل...</div>;
  if (!s || !ex) return <div className="page"><div className="error">التمرين ده مش في برنامج النهارده.</div><button className="btn ghost" onClick={() => go('')}>رجوع</button></div>;
  const locked = s.state === 'upcoming' || s.state === 'closed';

  return (
    <div className="page">
      <div className="top">
        <button className="btn ghost" onClick={() => go('')} aria-label="رجوع">→</button>
        <div style={{ flex: 1, textAlign: 'center' }}><h1 style={{ fontSize: 20 }}>{ex.name_ar}</h1><div className="en" style={{ textAlign: 'center' }}>{ex.name_en}</div></div>
        <span className={`chip ${s.state}`}>{clock(s.opens_at)}</span>
      </div>

      <Caution>{ex.caution_ar}</Caution>
      {s.extra_caution_ar && <Caution title="تنبيه من الأخصائي ليك">{s.extra_caution_ar}</Caution>}

      <div className="stage">
        <Figure slug={ex.slug} look={look} phase={figurePhase} />
        <span className="tag">● الرجل المصابة</span>
        {coach && !coach.finished && <span className="cue">مجموعة {coach.set}/{s.sets} · تكرار {coach.rep}/{s.reps} · {coach.cue}</span>}
        {coach?.finished && <span className="cue">خلّصت كل المجموعات 👏</span>}
      </div>

      <div className="dose">
        <div><b>{s.sets}</b><span>مجموعات</span></div>
        <div><b>{s.reps}</b><span>تكرار</span></div>
        <div><b>{s.hold_sec ? holdLabel(s.hold_sec) : '—'}</b><span>ثبات</span></div>
      </div>

      <div className="card stack">
        <b>الوضع والخطوات</b>
        <ol className="steps">{ex.steps_ar.map((x) => <li key={x}>{x}</li>)}</ol>
        {ex.tip_ar && <div className="notice small">💡 {ex.tip_ar}</div>}
      </div>

      {error && <div className="error">{error}</div>}
      {doneMsg && <div className="notice">{doneMsg}</div>}
      {s.state === 'done' ? (
        <button className="btn ghost block" onClick={() => go('')}>رجوع للتمارين</button>
      ) : locked ? (
        <div className="error">{s.state === 'upcoming' ? `التمرين بيفتح الساعة ${clock(s.opens_at)}` : 'وقت التمرين ده خلص واتقفل'}</div>
      ) : (
        <div className="row">
          <button className="btn ghost" style={{ flex: 1 }} onClick={toggleCoach}>{coachRef.current ? '■ وقّف العدّ' : '▶ ابدأ معايا'}</button>
          <button className="btn" style={{ flex: 1.4 }} onClick={finish}>✓ خلّصت التمرين</button>
        </div>
      )}
      {s.state === 'late' && <div className="small" style={{ color: 'var(--amber)', fontWeight: 700 }}>إنت في ساعة السماح: لازم تخلّص قبل {clock(s.closes_at)} وإلا الـ streak هيقع.</div>}
    </div>
  );
}
