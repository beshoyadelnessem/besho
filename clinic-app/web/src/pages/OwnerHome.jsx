import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useI18n } from '../i18n.js';
import { ErrorBox, LangSwitch, Logo, useError } from '../components/ui.jsx';
import { AddStaff } from './StaffHome.jsx';

const ZONES = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/Berlin', 'Europe/London', 'Europe/Vienna', 'Europe/Zurich'];

function NewClinic({ onDone }) {
  const { t, lang } = useI18n();
  const [f, setF] = useState({ clinic_name: '', timezone: 'Africa/Cairo', full_name: '', email: '', password: '', lang });
  const [error, setError] = useError();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError(null);
    try { await api.createClinic(f); onDone(t('clinicAdded', { name: f.clinic_name })); } catch (err) { setError(err); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <div className="formgrid">
        <label className="field">{t('clinicName')}<input id="nc-name" value={f.clinic_name} onChange={set('clinic_name')} required /></label>
        <label className="field">{t('timezone')}<select id="nc-tz" value={f.timezone} onChange={set('timezone')}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className="field">{t('adminName')}<input id="nc-admin" value={f.full_name} onChange={set('full_name')} required /></label>
        <label className="field">{t('adminEmail')}<input id="nc-email" type="email" value={f.email} onChange={set('email')} dir="ltr" required /></label>
        <label className="field">{t('tempPass')}<input id="nc-pass" value={f.password} onChange={set('password')} dir="ltr" minLength={8} required /></label>
      </div>
      <ErrorBox error={error} />
      <div className="row"><button className="btn">{t('add')}</button><button type="button" className="btn ghost" onClick={() => onDone('')}>{t('cancel')}</button></div>
    </form>
  );
}

// Suspend / reactivate / delete one clinic. Deleting needs the clinic's name typed in.
function ClinicActions({ c, onDone }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useError();
  const run = async (fn, msg) => { setError(null); try { await fn(); onDone(msg); } catch (e) { setError(e); } };
  return (
    <div className="stack">
      <div className="row">
        {c.active !== false
          ? <button type="button" className="btn ghost" onClick={() => run(() => api.setClinicActive(c.id, false), t('clinicSuspendedMsg', { name: c.name }))}>{t('suspendClinic')}</button>
          : <button type="button" className="btn" onClick={() => run(() => api.setClinicActive(c.id, true), t('clinicReactivated', { name: c.name }))}>{t('reactivateClinic')}</button>}
        {!confirming && <button type="button" className="btn danger" onClick={() => setConfirming(true)}>{t('deleteClinic')}</button>}
      </div>
      {c.active !== false && <div className="small muted">{t('suspendNote')}</div>}
      {confirming && (
        <div className="stack delete-box">
          <div className="caution-text">{t('deleteClinicWarn', { name: c.name })}</div>
          <label className="field">{t('deleteClinicType')}<input id={`del-clinic-${c.id}`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={c.name} dir="auto" /></label>
          <div className="row">
            <button type="button" className="btn danger" disabled={typed.trim() !== c.name} onClick={() => run(() => api.deleteClinic(c.id, typed), t('clinicDeleted', { name: c.name }))}>{t('deleteNow')}</button>
            <button type="button" className="btn ghost" onClick={() => { setConfirming(false); setTyped(''); }}>{t('cancel')}</button>
          </div>
        </div>
      )}
      <ErrorBox error={error} />
    </div>
  );
}

// Platform owner: manages clinics and their staff, never patient data.
export default function OwnerHome({ me, setLang }) {
  const { t, lang } = useI18n();
  const [clinics, setClinics] = useState(null);
  const [staff, setStaff] = useState([]);
  const [adding, setAdding] = useState(null);   // 'clinic' | clinic id
  const [msg, setMsg] = useState('');
  const load = async () => { const [c, s] = await Promise.all([api.clinics(), api.staff()]); setClinics(c); setStaff(s); };
  useEffect(() => { load(); }, []);
  const done = (m) => { setAdding(null); setMsg(m); if (m) load(); };

  return (
    <div className="page wide">
      <div className="top">
        <Logo />
        <div><b>{me.full_name}</b><div className="muted small">{t('owner')}</div></div>
        {api.demo && <span className="demo-badge">{t('demo')}</span>}
        <div className="row" style={{ marginInlineStart: api.demo ? 0 : 'auto' }}>
          <LangSwitch value={lang} onChange={(l) => { setLang(l); api.updateMe({ lang: l }); }} />
          <button className="btn ghost" onClick={() => api.signOut()}>{t('signOut')}</button>
        </div>
      </div>
      <div className="notice small">{t('ownerNote')}</div>
      {msg && <div className="notice" role="status">{msg}</div>}
      <div className="row spread"><h1 style={{ fontSize: 22 }}>{t('clinics')}</h1>{adding !== 'clinic' && <button className="btn" onClick={() => setAdding('clinic')}>{t('newClinic')}</button>}</div>
      {adding === 'clinic' && <NewClinic onDone={done} />}
      {clinics === null ? <div className="muted">{t('loading')}</div> : (
        <div className="stack">
          {clinics.map((c) => {
            const team = staff.filter((s) => s.clinic_id === c.id);
            return (
              <div key={c.id} className="card stack" style={{ opacity: c.active === false ? 0.75 : 1 }}>
                <div className="row spread"><div><b>{c.name}</b>{' '}<span className={`chip ${c.active === false ? 'closed' : 'open'}`}>{t(c.active === false ? 'clinicSuspended' : 'clinicActive')}</span>
                  <div className="small muted">{c.timezone} · {t('staffCount', { n: team.length })}</div></div>
                  {adding !== c.id && <button className="btn ghost" onClick={() => setAdding(c.id)}>+ {t('addStaffTo')}</button>}</div>
                {adding === c.id && <AddStaff clinicId={c.id} onDone={done} />}
                <div className="row">{team.map((s) => <span key={s.id} className="chip">{s.full_name} · {t(s.role)}</span>)}</div>
                <ClinicActions c={c} onDone={done} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
