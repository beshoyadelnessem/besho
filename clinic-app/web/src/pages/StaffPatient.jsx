import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/index.js';
import Figure, { lookOf } from '../components/Figure.jsx';
import { Caution } from './ExerciseView.jsx';
import { DAY_LABEL, addDays, ageFrom, clock, dateLabel, holdLabel, todayISO } from '../lib/format.js';
import { PHASES } from '../lib/program.js';

function Prescribe({ patientId, library, onDone }) {
  const [slug, setSlug] = useState('');
  const ex = library.find((e) => e.slug === slug);
  const [f, setF] = useState({});
  const pick = (s) => {
    const e = library.find((x) => x.slug === s); setSlug(s);
    setF({ sets: e.default_sets, reps: e.default_reps, hold_sec: e.default_hold_sec, scheduled_time: '09:00', extra_caution_ar: '' });
  };
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      await api.addPrescription({ patient_id: patientId, exercise_slug: slug, sets: +f.sets, reps: +f.reps, hold_sec: +f.hold_sec,
        scheduled_time: f.scheduled_time, extra_caution_ar: f.extra_caution_ar.trim() || null });
      onDone();
    } catch (err) { setError(err.message); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <b>إضافة تمرين للمريض</b>
      {[1, 2].map((ph) => (
        <div key={ph} className="stack">
          <div className="small"><b>{PHASES[ph].title}</b></div>
          <div className="choices">
            {library.filter((e) => e.phase === ph).map((e) => (
              <button type="button" key={e.slug} className="choice" aria-pressed={slug === e.slug} onClick={() => pick(e.slug)}>{e.name_ar}</button>
            ))}
          </div>
        </div>
      ))}
      {ex && (<>
        <Caution title="التنبيه الثابت للتمرين">{ex.caution_ar}</Caution>
        <div className="formgrid">
          <label className="field">المعاد<input id="rx-time" type="time" value={f.scheduled_time} onChange={set('scheduled_time')} required /></label>
          <label className="field">مجموعات<input id="rx-sets" type="number" min="1" max="10" value={f.sets} onChange={set('sets')} required /></label>
          <label className="field">تكرار<input id="rx-reps" type="number" min="1" max="100" value={f.reps} onChange={set('reps')} required /></label>
          <label className="field">ثبات (ثانية)<input id="rx-hold" type="number" min="0" max="600" value={f.hold_sec} onChange={set('hold_sec')} /></label>
        </div>
        <label className="field">تنبيه إضافي للمريض ده (بيظهر بالأحمر)<input id="rx-caution" value={f.extra_caution_ar} onChange={set('extra_caution_ar')} maxLength={300} placeholder="مثلاً: اثني لحد 90 درجة بس" /></label>
        <div className="small muted">التمرين بيفتح للمريض من المعاد لمدة ساعتين، وبعدهم ساعة سماح بيتسجل فيها متأخر، وبعدها بيتقفل.</div>
      </>)}
      {error && <div className="error">{error}</div>}
      <div className="row"><button className="btn" disabled={!ex}>إضافة للبرنامج</button><button type="button" className="btn ghost" onClick={onDone}>إلغاء</button></div>
    </form>
  );
}

export default function StaffPatient({ me, id, library, go }) {
  const [p, setP] = useState(null);
  const [rx, setRx] = useState([]);
  const [pain, setPain] = useState([]);
  const [days, setDays] = useState([]);
  const [streak, setStreak] = useState(null);
  const [staff, setStaff] = useState([]);
  const [adding, setAdding] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const t = todayISO();
    const [a, b, c, d, s, st] = await Promise.all([api.patient(id), api.prescriptions(id), api.painReports(id),
      api.days(id, addDays(t, -27), t), api.streak(id), api.staff()]);
    setP(a); setRx(b); setPain(c); setDays(d); setStreak(s); setStaff(st);
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, [id]);
  const look = useMemo(() => lookOf(p), [p]);
  if (!p) return <div className="page muted">{error || 'بيحمّل...'}</div>;

  const cur = p.assignments.find((a) => a.active);
  const canEdit = me.role === 'admin' || cur?.therapist_id === me.id;
  const nameOf = (tid) => staff.find((s) => s.id === tid)?.full_name ?? '—';
  const byId = Object.fromEntries(library.map((e) => [e.slug, e]));
  const act = async (fn, ok) => { setError(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e) { setError(e.message); } };
  const counts = days.reduce((m, d) => ({ ...m, [d.status]: (m[d.status] || 0) + 1 }), {});
  const scored = (counts.done || 0) + (counts.missed || 0) + (counts.restored || 0);

  return (
    <div className="page wide">
      <div className="top">
        <button className="btn ghost" onClick={() => go('')} aria-label="رجوع">→</button>
        <div style={{ flex: 1 }}><h1 style={{ fontSize: 22 }}>{p.full_name}</h1>
          <div className="small muted"><span dir="ltr">{p.phone}</span>{p.gender && ` · ${p.gender === 'male' ? 'ذكر' : 'أنثى'}`}{p.birth_year && ` · ${ageFrom(p.birth_year)} سنة`} · الأخصائي: {nameOf(cur?.therapist_id)}</div></div>
        {streak && <span className="chip rest" style={{ fontSize: 16 }}>🔥 {streak.streak}</span>}
      </div>
      {!canEdit && <div className="notice">المريض ده اتنقل لأخصائي تاني. تقدر تشوف تاريخه بس، من غير تعديل.</div>}
      {msg && <div className="notice">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="grid2">
        <div className="stack">
          <div className="card stack">
            <div className="row spread"><b>الالتزام – آخر 4 أسابيع</b><span className="small muted">{scored ? Math.round(((counts.done || 0) / scored) * 100) : 0}% أيام كاملة</span></div>
            <div className="days">{days.map((d) => <span key={d.day} className={d.status} title={`${dateLabel(d.day)}: ${DAY_LABEL[d.status]}`}>{Number(d.day.slice(8))}</span>)}</div>
            <div className="row small"><span className="chip done">خلّص {counts.done || 0}</span><span className="chip missed">فوّت {counts.missed || 0}</span><span className="chip rest">راحة {counts.rest || 0}</span><span className="chip restored">اتسترجع {counts.restored || 0}</span></div>
          </div>
          <div className="card stack">
            <b>بلاغات الألم</b>
            {pain.length === 0 ? <div className="small muted">مفيش بلاغات.</div> : pain.map((x) => (
              <div key={x.id} className="row spread" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <div style={{ minWidth: 0 }}><b>{dateLabel(x.day)}</b> {!x.seen && <span className="badge-red">جديد</span>}<div className="small">{x.note || 'من غير تفاصيل'}</div></div>
                {!x.seen && canEdit && <button className="btn ghost" onClick={() => act(() => api.markPainSeen(x.id))}>شُفته</button>}
              </div>
            ))}
          </div>
          <div className="card stack">
            <b>بيانات</b>
            <label className="field">بداية العلاج (بداية أسبوع الاسترجاع)
              <input id="pt-start" type="date" defaultValue={p.treatment_start || ''} disabled={!canEdit}
                onBlur={(e) => e.target.value && e.target.value !== p.treatment_start && act(() => api.setStart(p.id, e.target.value), 'اتحفظ تاريخ البداية.')} />
            </label>
            {canEdit && (
              <div className="row">
                <input id="pt-pass" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="باسورد جديد للمريض" dir="ltr" style={{ flex: 1 }} />
                <button className="btn ghost" disabled={pw.length < 8} onClick={() => act(() => api.resetPassword(p.id, pw), 'اتغيّر الباسورد. ادّيه للمريض.').then(() => setPw(''))}>غيّر الباسورد</button>
              </div>
            )}
            {me.role === 'admin' && (
              <label className="field">نقل المريض لأخصائي تاني
                <select id="pt-transfer" value={cur?.therapist_id || ''} onChange={(e) => act(() => api.transfer(p.id, e.target.value), 'اتنقل المريض. الأخصائي القديم هيفضل يشوف تاريخه بس.')}>
                  {staff.filter((s) => s.role === 'therapist').map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </label>
            )}
            {p.onboarded && <div className="stage" style={{ maxWidth: 260 }}><Figure slug="calf" look={look} still /></div>}
          </div>
        </div>

        <div className="stack">
          <div className="row spread"><h2 style={{ fontSize: 18 }}>برنامج التمارين</h2>{canEdit && !adding && <button className="btn" onClick={() => setAdding(true)}>+ تمرين</button>}</div>
          {adding && <Prescribe patientId={p.id} library={library} onDone={() => { setAdding(false); load(); }} />}
          {rx.length === 0 && <div className="card muted">لسه مفيش تمارين.</div>}
          {rx.map((r) => (
            <div key={r.id} className="card" style={{ opacity: r.active ? 1 : 0.55 }}>
              <div className="row spread">
                <div style={{ minWidth: 0 }}><div className="nm">{byId[r.exercise_slug]?.name_ar}</div>
                  <div className="small muted">{clock(r.scheduled_time)} · {r.sets} × {r.reps}{r.hold_sec ? ` · ثبات ${holdLabel(r.hold_sec)}` : ''} · المرحلة {byId[r.exercise_slug]?.phase}</div></div>
                {r.active ? (canEdit && <button className="btn danger" onClick={() => act(() => api.stopPrescription(r.id), 'اتوقف التمرين.')}>إيقاف</button>)
                  : <span className="chip upcoming">متوقف</span>}
              </div>
              {r.extra_caution_ar && <div className="small" style={{ color: 'var(--red)', fontWeight: 800 }}>⚠ {r.extra_caution_ar}</div>}
            </div>
          ))}
          <div className="card stack small">
            {[1, 2].map((ph) => (
              <div key={ph}><b>{PHASES[ph].title}</b>
                <div className="muted">شروط الانتقال للمرحلة اللي بعدها (للأخصائي):</div>
                <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{PHASES[ph].next.map((x) => <li key={x}>{x}</li>)}</ul></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
