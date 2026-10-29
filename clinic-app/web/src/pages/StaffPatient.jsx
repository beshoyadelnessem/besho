import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/index.js';
import { exText, useI18n } from '../i18n.js';
import { Caution, DayStrip, ErrorBox, Figure, PainChart, lookOf, useError } from '../components/ui.jsx';
import { ChatThread } from './Chat.jsx';
import { addDays, ageFrom, clock, dateLabel, dateTime, holdLabel, todayISO } from '../lib/format.js';
import { phaseText } from '../lib/program.js';

function Prescribe({ patientId, library, onDone }) {
  const { t, lang } = useI18n();
  const [slug, setSlug] = useState('');
  const ex = library.find((e) => e.slug === slug);
  const [f, setF] = useState({});
  const [error, setError] = useError();
  const pick = (s) => {
    const e = library.find((x) => x.slug === s); setSlug(s);
    setF({ sets: e.default_sets, reps: e.default_reps, hold_sec: e.default_hold_sec, scheduled_time: '09:00', extra_caution: '' });
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try {
      await api.addPrescription({ patient_id: patientId, exercise_slug: slug, sets: +f.sets, reps: +f.reps, hold_sec: +f.hold_sec,
        scheduled_time: f.scheduled_time, extra_caution: f.extra_caution.trim() || null });
      onDone();
    } catch (err) { setError(err); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <b>{t('addToPatient')}</b>
      {[1, 2].map((ph) => (
        <div key={ph} className="stack">
          <div className="small"><b>{phaseText(ph, lang).title}</b></div>
          <div className="choices">
            {library.filter((e) => e.phase === ph).map((e) => (
              <button type="button" key={e.slug} className="choice" aria-pressed={slug === e.slug} onClick={() => pick(e.slug)}>{exText(e, lang).name}</button>
            ))}
          </div>
        </div>
      ))}
      {ex && (<>
        <Caution title={t('fixedCaution')}>{exText(ex, lang).caution}</Caution>
        <div className="formgrid">
          <label className="field">{t('time')}<input id="rx-time" type="time" value={f.scheduled_time} onChange={set('scheduled_time')} required /></label>
          <label className="field">{t('sets')}<input id="rx-sets" type="number" min="1" max="10" value={f.sets} onChange={set('sets')} required /></label>
          <label className="field">{t('reps')}<input id="rx-reps" type="number" min="1" max="100" value={f.reps} onChange={set('reps')} required /></label>
          <label className="field">{t('holdSec')}<input id="rx-hold" type="number" min="0" max="600" value={f.hold_sec} onChange={set('hold_sec')} /></label>
        </div>
        <label className="field">{t('extraCaution')}<input id="rx-caution" value={f.extra_caution} onChange={set('extra_caution')} maxLength={300} placeholder={t('extraPh')} /></label>
        <div className="small muted">{t('windowNote')}</div>
      </>)}
      <ErrorBox error={error} />
      <div className="row"><button className="btn" disabled={!ex}>{t('addToProgram')}</button><button type="button" className="btn ghost" onClick={onDone}>{t('cancel')}</button></div>
    </form>
  );
}

function BookSession({ patientId, staff, defaultTherapist, onDone }) {
  const { t } = useI18n();
  const [f, setF] = useState({ date: addDays(todayISO(), 1), time: '11:00', duration_min: 45, therapist_id: defaultTherapist, note: '' });
  const [error, setError] = useError();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try {
      await api.addAppointment({ patient_id: patientId, therapist_id: f.therapist_id, starts_at: new Date(`${f.date}T${f.time}`).toISOString(),
        duration_min: +f.duration_min, note: f.note.trim() || null });
      onDone(t('booked'));
    } catch (err) { setError(err); }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="formgrid">
        <label className="field">{t('date')}<input id="ap-date" type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field">{t('time')}<input id="ap-time" type="time" value={f.time} onChange={set('time')} required /></label>
        <label className="field">{t('duration')}<input id="ap-dur" type="number" min="10" max="240" value={f.duration_min} onChange={set('duration_min')} /></label>
        <label className="field">{t('therapist')}
          <select id="ap-th" value={f.therapist_id} onChange={set('therapist_id')}>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
        </label>
      </div>
      <label className="field">{t('note')}<input id="ap-note" value={f.note} onChange={set('note')} maxLength={300} /></label>
      <ErrorBox error={error} />
      <div><button className="btn">{t('book')}</button></div>
    </form>
  );
}

export function eventText(e, t) {
  if (e.kind === 'badge') return t('ev_badge', { badge: t('badge_' + e.data?.badge) });
  return t('ev_' + e.kind);
}

export default function StaffPatient({ me, id, library, go }) {
  const { t, lang } = useI18n();
  const [d, setD] = useState(null);
  const [adding, setAdding] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplPick, setTplPick] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useError();
  const from = addDays(todayISO(), -27);

  const load = async () => {
    const t0 = todayISO();
    const [p, rx, pain, days, streak, staff, events, scores, appts, tpls] = await Promise.all([
      api.patient(id), api.prescriptions(id), api.painReports(id), api.days(id, from, t0), api.streak(id),
      api.staff(), api.events(id), api.painScores(id, from), api.appointments(id), api.templates()]);
    setD({ p, rx, pain, days, streak, staff, events, scores, appts, tpls });
  };
  useEffect(() => { load().catch(setError); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = useMemo(() => lookOf(d?.p), [d?.p]);
  if (!d) return <div className="page muted">{error || t('loading')}</div>;
  const { p, rx, pain, days, streak, staff, events, scores, appts, tpls } = d;

  const cur = p.assignments.find((a) => a.active);
  const canEdit = me.role === 'admin' || cur?.therapist_id === me.id;
  const names = Object.fromEntries(staff.map((s) => [s.id, s.full_name]));
  const byId = Object.fromEntries(library.map((e) => [e.slug, e]));
  const act = async (fn, ok) => { setError(null); setMsg(''); try { const r = await fn(); if (ok) setMsg(typeof ok === 'function' ? ok(r) : ok); await load(); } catch (e) { setError(e); } };
  const counts = days.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});
  const scored = (counts.done || 0) + (counts.missed || 0) + (counts.restored || 0);
  const therapists = staff.filter((s) => s.role === 'therapist' || s.id === me.id);

  return (
    <div className="page wide">
      <div className="top">
        <button className="btn ghost icon-btn" onClick={() => go('')} aria-label={t('back')}>{lang === 'ar' ? '→' : '←'}</button>
        <div style={{ flex: 1, minWidth: 0 }}><h1 style={{ fontSize: 22 }}>{p.full_name}</h1>
          <div className="small muted"><span dir="ltr">{p.phone}</span>{p.gender && ` · ${t(p.gender)}`}{p.birth_year && ` · ${ageFrom(p.birth_year)}`} · {names[cur?.therapist_id] ?? '—'}</div></div>
        <span className="chip rest" style={{ fontSize: 16 }}>🔥 {streak.streak}</span>
        <button className="btn ghost" onClick={() => go('report-' + p.id)}>{t('report')}</button>
      </div>
      {!canEdit && <div className="notice">{t('readOnly')}</div>}
      {msg && <div className="notice" role="status">{msg}</div>}
      <ErrorBox error={error} />

      <div className="grid2">
        <div className="stack">
          <div className="card stack">
            <div className="row spread"><b>{t('adherence')}</b><span className="small muted">{t('fullDays', { n: scored ? Math.round(((counts.done || 0) / scored) * 100) : 0 })}</span></div>
            <DayStrip days={days} />
            <div className="row small">
              <span className="chip done">{t('dDone')} {counts.done || 0}</span><span className="chip missed">{t('dMissed')} {counts.missed || 0}</span>
              <span className="chip rest">{t('day_rest')} {counts.rest || 0}</span><span className="chip restored">{t('day_restored')} {counts.restored || 0}</span>
            </div>
          </div>
          <div className="card stack">
            <b>{t('painChart')}</b>
            {scores.length ? <PainChart scores={scores} from={from} /> : <div className="small muted">{t('none')}</div>}
          </div>
          <div className="card stack">
            <b>{t('painReports')}</b>
            {pain.length === 0 ? <div className="small muted">{t('noPain')}</div> : pain.map((x) => (
              <div key={x.id} className="row spread" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <div style={{ minWidth: 0 }}><b>{dateLabel(x.day, lang)}</b> {!x.seen && <span className="badge-red">{t('newTag')}</span>}<div className="small">{x.note || t('noDetails')}</div></div>
                {!x.seen && canEdit && <button className="btn ghost" onClick={() => act(() => api.markPainSeen(x.id))}>{t('seen')}</button>}
              </div>
            ))}
          </div>
          <div className="card stack">
            <div className="toggle"><b>{t('chatToggle')}</b>
              <button className="switch" role="switch" aria-checked={p.chat_enabled} aria-label={t('chatToggle')} disabled={!canEdit}
                onClick={() => act(() => api.setChat(p.id, !p.chat_enabled))} /></div>
            <div className="small muted">{p.chat_enabled ? t('chatOn') : t('chatOff')}</div>
            <ChatThread patientId={p.id} meId={me.id} canWrite={canEdit} names={{ ...names, [p.id]: p.full_name }} />
          </div>
          <div className="card stack">
            <b>{t('record')}</b>
            {events.length === 0 ? <div className="small muted">{t('none')}</div> : (
              <ul className="timeline">{events.map((e) => <li key={e.id} className={`ev-${e.kind}`}><span className="small muted">{dateTime(e.created_at, lang)}</span><div>{eventText(e, t)}</div></li>)}</ul>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="row spread"><h2 style={{ fontSize: 18 }}>{t('program')}</h2>{canEdit && !adding && <button className="btn" onClick={() => setAdding(true)}>{t('addEx')}</button>}</div>
          {adding && <Prescribe patientId={p.id} library={library} onDone={() => { setAdding(false); load(); }} />}
          {canEdit && tpls.length > 0 && (
            <div className="card row">
              <select id="tpl-pick" value={tplPick} onChange={(e) => setTplPick(e.target.value)} style={{ flex: 1 }}>
                <option value="">{t('applyTemplate')}</option>{tpls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button className="btn ghost" disabled={!tplPick} onClick={() => act(() => api.applyTemplate(p.id, Number(tplPick)), (n) => t('applied', { n }))}>{t('apply')}</button>
            </div>
          )}
          {rx.length === 0 && <div className="card muted">{t('noProgram')}</div>}
          {rx.map((r) => (
            <div key={r.id} className="card" style={{ opacity: r.active ? 1 : 0.55 }}>
              <div className="row spread">
                <div style={{ minWidth: 0 }}><div className="nm">{exText(byId[r.exercise_slug], lang).name}</div>
                  <div className="small muted">{clock(r.scheduled_time, lang)} · {r.sets} × {r.reps}{r.hold_sec ? ` · ${t('hold')} ${holdLabel(r.hold_sec, lang)}` : ''} · {t('phaseN', { n: byId[r.exercise_slug]?.phase })}</div></div>
                {r.active ? (canEdit && <button className="btn danger" onClick={() => act(() => api.stopPrescription(r.id), t('exStopped'))}>{t('stop')}</button>)
                  : <span className="chip upcoming">{t('stopped')}</span>}
              </div>
              {r.extra_caution && <div className="small" style={{ color: 'var(--red)', fontWeight: 800 }}>⚠ {r.extra_caution}</div>}
            </div>
          ))}
          {canEdit && rx.some((r) => r.active) && (
            <div className="card row">
              <input id="tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={t('templateName')} style={{ flex: 1 }} />
              <button className="btn ghost" disabled={tplName.trim().length < 2} onClick={() => act(() => api.saveTemplate(p.id, tplName.trim()), t('templateSaved')).then(() => setTplName(''))}>{t('saveTemplate')}</button>
            </div>
          )}

          <div className="card stack">
            <b>{t('apptsTab')}</b>
            {appts.length === 0 && <div className="small muted">{t('none')}</div>}
            {appts.map((a) => (
              <div key={a.id} className="row spread" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <div><b>{dateTime(a.starts_at, lang)}</b> <span className="small muted">· {a.duration_min}′ · {names[a.therapist_id]}</span>{a.note && <div className="small">{a.note}</div>}</div>
                {a.status === 'booked' && canEdit ? (
                  <div className="row">
                    <button className="btn ghost" onClick={() => act(() => api.updateAppointment(a.id, { status: 'done' }))}>{t('markDone')}</button>
                    <button className="btn ghost" onClick={() => act(() => api.updateAppointment(a.id, { status: 'no_show' }))}>{t('markNoShow')}</button>
                    <button className="btn danger" onClick={() => act(() => api.updateAppointment(a.id, { status: 'cancelled' }))}>{t('cancelAppt')}</button>
                  </div>
                ) : <span className={`chip ap-${a.status}`}>{t('ap_' + a.status)}</span>}
              </div>
            ))}
            {canEdit && <><b className="small">{t('bookSession')}</b><BookSession patientId={p.id} staff={therapists} defaultTherapist={cur?.therapist_id || me.id} onDone={(m) => act(async () => {}, m)} /></>}
          </div>

          <div className="card stack">
            <b>{t('details')}</b>
            <label className="field">{t('startLabel')}
              <input id="pt-start" type="date" defaultValue={p.treatment_start || ''} disabled={!canEdit}
                onBlur={(e) => e.target.value && e.target.value !== p.treatment_start && act(() => api.setStart(p.id, e.target.value), t('startSaved'))} />
            </label>
            {canEdit && (
              <div className="row">
                <input id="pt-pass" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t('newPassPh')} dir="ltr" style={{ flex: 1 }} />
                <button className="btn ghost" disabled={pw.length < 8} onClick={() => act(() => api.resetPassword(p.id, pw), t('passChanged')).then(() => setPw(''))}>{t('changePass')}</button>
              </div>
            )}
            {me.role === 'admin' && (
              <label className="field">{t('transfer')}
                <select id="pt-transfer" value={cur?.therapist_id || ''} onChange={(e) => act(() => api.transfer(p.id, e.target.value), t('transferred'))}>
                  {staff.filter((s) => s.role === 'therapist').map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </label>
            )}
            {p.onboarded && <div className="stage" style={{ maxWidth: 280 }}><Figure slug="calf" look={look} still /></div>}
          </div>

          <div className="card stack small">
            {[1, 2].map((ph) => (
              <div key={ph}><b>{phaseText(ph, lang).title}</b>
                <div className="muted">{t('criteria')}</div>
                <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{phaseText(ph, lang).next.map((x) => <li key={x}>{x}</li>)}</ul></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
