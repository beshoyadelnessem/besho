import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { LANGS, exText, useI18n } from '../i18n.js';
import { ErrorBox, LangSwitch, Logo, useError } from '../components/ui.jsx';
import { clock, dateTime, todayISO } from '../lib/format.js';

function AddPatient({ me, staff, onDone }) {
  const { t, lang } = useI18n();
  const [f, setF] = useState({ full_name: '', phone: '', password: '', treatment_start: todayISO(), therapist_id: '', lang });
  const [error, setError] = useError();
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await api.createUser({ role: 'patient', ...f }); onDone(t('patientAdded', { name: f.full_name || f.phone })); }
    catch (err) { setError(err); setBusy(false); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <b>{t('newPatient').replace('+ ', '')}</b>
      <div className="formgrid">
        <label className="field">{t('nameOptional')}<input id="np-name" value={f.full_name} onChange={set('full_name')} dir="auto" /></label>
        <label className="field">{t('phone')}<input id="np-phone" value={f.phone} onChange={set('phone')} inputMode="tel" dir="ltr" required /></label>
        <label className="field">{t('tempPass')}<input id="np-pass" value={f.password} onChange={set('password')} dir="ltr" minLength={8} required /></label>
        <label className="field">{t('startDate')}<input id="np-start" type="date" value={f.treatment_start} onChange={set('treatment_start')} required /></label>
        <label className="field">{t('patientLang')}
          <select id="np-lang" value={f.lang} onChange={set('lang')}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
        </label>
        {me.role === 'admin' && (
          <label className="field">{t('responsible')}
            <select id="np-therapist" value={f.therapist_id} onChange={set('therapist_id')} required>
              <option value="">{t('choose')}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="small muted">{t('phoneLoginNote')}</div>
      <ErrorBox error={error} />
      <div className="row"><button className="btn" disabled={busy}>{t('add')}</button><button type="button" className="btn ghost" onClick={() => onDone('')}>{t('cancel')}</button></div>
    </form>
  );
}

export function AddStaff({ clinicId, onDone, allowAdmin = true }) {
  const { t, lang } = useI18n();
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'therapist', lang });
  const [error, setError] = useError();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try { await api.createUser({ ...f, clinic_id: clinicId }); onDone(t('staffAdded', { name: f.full_name })); } catch (err) { setError(err); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <b>{t('newStaff')}</b>
      <div className="formgrid">
        <label className="field">{t('name')}<input id="ns-name" value={f.full_name} onChange={set('full_name')} required /></label>
        <label className="field">{t('email')}<input id="ns-email" type="email" value={f.email} onChange={set('email')} dir="ltr" required /></label>
        <label className="field">{t('tempPass')}<input id="ns-pass" value={f.password} onChange={set('password')} dir="ltr" minLength={8} required /></label>
        <label className="field">{t('role')}
          <select id="ns-role" value={f.role} onChange={set('role')}>
            <option value="therapist">{t('therapist')}</option>{allowAdmin && <option value="admin">{t('admin')}</option>}
          </select>
        </label>
      </div>
      <ErrorBox error={error} />
      <div className="row"><button className="btn">{t('add')}</button><button type="button" className="btn ghost" onClick={() => onDone('')}>{t('cancel')}</button></div>
    </form>
  );
}

function Templates({ library }) {
  const { t, lang } = useI18n();
  const [list, setList] = useState(null);
  const load = () => api.templates().then(setList);
  useEffect(() => { load(); }, []);
  const byId = Object.fromEntries(library.map((e) => [e.slug, e]));
  if (!list) return <div className="muted">{t('loading')}</div>;
  if (!list.length) return <div className="card muted">{t('noTemplates')}</div>;
  return (
    <div className="stack">
      {list.map((tp) => (
        <div key={tp.id} className="card stack">
          <div className="row spread"><b>{tp.name}</b><button className="btn danger" onClick={() => api.deleteTemplate(tp.id).then(load)}>{t('delete')}</button></div>
          <div className="row">{tp.template_items.map((i, k) => <span key={k} className="chip">{clock(i.scheduled_time, lang)} · {exText(byId[i.exercise_slug], lang).name}</span>)}</div>
        </div>
      ))}
    </div>
  );
}

function Appointments({ patients, staff, go }) {
  const { t, lang } = useI18n();
  const [list, setList] = useState(null);
  const load = () => api.appointments().then(setList);
  useEffect(() => { load(); }, []);
  const pName = (id) => patients.find((p) => p.id === id)?.full_name ?? '—';
  const sName = (id) => staff.find((s) => s.id === id)?.full_name ?? '—';
  if (!list) return <div className="muted">{t('loading')}</div>;
  const up = list.filter((a) => new Date(a.starts_at) >= new Date(Date.now() - 3600e3));
  if (!up.length) return <div className="card muted">{t('none')}</div>;
  return (
    <div className="card table-wrap">
      <table>
        <thead><tr><th>{t('date')}</th><th>{t('patients')}</th><th>{t('therapist')}</th><th>{t('note')}</th><th /></tr></thead>
        <tbody>{up.map((a) => (
          <tr key={a.id}>
            <td>{dateTime(a.starts_at, lang)} · {a.duration_min}′</td>
            <td><button className="link" onClick={() => go('patient-' + a.patient_id)}>{pName(a.patient_id)}</button></td>
            <td>{sName(a.therapist_id)}</td><td>{a.note || ''}</td>
            <td><span className={`chip ap-${a.status}`}>{t('ap_' + a.status)}</span></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function StaffHome({ me, go, library, setLang }) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState('patients');
  const [patients, setPatients] = useState(null);
  const [staff, setStaff] = useState([]);
  const [pain, setPain] = useState([]);
  const [unread, setUnread] = useState({});
  const [streaks, setStreaks] = useState({});
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useError();

  const load = async () => {
    const [p, s, u, un] = await Promise.all([api.patients(), api.staff(), api.unseenPain(), api.unread()]);
    setPatients(p); setStaff(s); setPain(u); setUnread(un);
    const entries = await Promise.all(p.map(async (x) => [x.id, await api.streak(x.id).catch(() => null)]));
    setStreaks(Object.fromEntries(entries));
  };
  useEffect(() => { load().catch(setError); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (m) => { setAdding(false); setMsg(m); if (m) load(); };
  const nameOf = (id) => staff.find((s) => s.id === id)?.full_name ?? '—';
  const shown = (patients || []).filter((p) => !q || p.full_name.toLowerCase().includes(q.toLowerCase()) || (p.phone || '').includes(q));
  const tabs = [['patients', t('patients')], ...(me.role === 'admin' ? [['staff', t('staffTab')]] : []), ['templates', t('templatesTab')], ['appts', t('apptsTab')]];

  return (
    <div className="page wide">
      <div className="top">
        <Logo />
        <div><b>{me.full_name}</b><div className="muted small">{t(me.role)}</div></div>
        {api.demo && <span className="demo-badge">{t('demo')}</span>}
        <div className="row" style={{ marginInlineStart: api.demo ? 0 : 'auto' }}>
          <LangSwitch value={lang} onChange={(l) => { setLang(l); api.updateMe({ lang: l }); }} />
          <button className="btn ghost" onClick={() => api.signOut()}>{t('signOut')}</button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setAdding(false); }}>{label}</button>)}
      </div>
      {msg && <div className="notice" role="status">{msg}</div>}
      <ErrorBox error={error} />

      {tab === 'patients' && (<>
        <div className="row spread">
          <h1 style={{ fontSize: 22 }}>{me.role === 'admin' ? t('allPatients') : t('yourPatients')}</h1>
          <div className="row">
            <input id="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} style={{ width: 230 }} />
            {!adding && <button className="btn" onClick={() => setAdding(true)}>{t('newPatient')}</button>}
          </div>
        </div>
        {adding && <AddPatient me={me} staff={staff.filter((s) => s.role === 'therapist')} onDone={done} />}
        {patients === null ? <div className="muted">{t('loading')}</div> : shown.length === 0 ? <div className="card muted">{t('noPatients')}</div> : (
          <div className="stack">
            {shown.map((p) => {
              const cur = p.assignments.find((a) => a.active);
              const mineNow = me.role === 'admin' || cur?.therapist_id === me.id;
              const alerts = pain.filter((x) => x.patient_id === p.id).length;
              const st = streaks[p.id];
              return (
                <button key={p.id} className="prow" onClick={() => go('patient-' + p.id)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{p.full_name}{' '}
                      {alerts > 0 && <span className="badge-red">{t('painBadge', { n: alerts })}</span>}{' '}
                      {unread[p.id] > 0 && <span className="badge-teal">💬 {t('unreadBadge', { n: unread[p.id] })}</span>}
                    </div>
                    <div className="small muted"><span dir="ltr">{p.phone}</span>{me.role === 'admin' && ` · ${nameOf(cur?.therapist_id)}`}{!mineNow && ` · ${t('movedAway')}`}</div>
                  </div>
                  {st && <span className="chip rest">🔥 {st.streak}</span>}
                  {!p.onboarded && <span className="chip upcoming">{t('notSignedYet')}</span>}
                  <span aria-hidden="true">{lang === 'ar' ? '‹' : '›'}</span>
                </button>
              );
            })}
          </div>
        )}
      </>)}

      {tab === 'staff' && me.role === 'admin' && (<>
        <div className="row spread"><h1 style={{ fontSize: 22 }}>{t('staffTab')}</h1>{!adding && <button className="btn" onClick={() => setAdding(true)}>+ {t('add')}</button>}</div>
        {adding && <AddStaff onDone={done} />}
        <div className="card table-wrap">
          <table><thead><tr><th>{t('name')}</th><th>{t('role')}</th><th>{t('patientsCount')}</th></tr></thead><tbody>
            {staff.map((s) => (
              <tr key={s.id}><td>{s.full_name}</td><td>{t(s.role)}</td>
                <td>{(patients || []).filter((p) => p.assignments.some((a) => a.active && a.therapist_id === s.id)).length}</td></tr>
            ))}
          </tbody></table>
        </div>
      </>)}

      {tab === 'templates' && <Templates library={library} />}
      {tab === 'appts' && <Appointments patients={patients || []} staff={staff} go={go} />}
    </div>
  );
}
