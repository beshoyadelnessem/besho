import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { todayISO } from '../lib/format.js';

function AddPatient({ me, staff, onDone }) {
  const [f, setF] = useState({ full_name: '', phone: '', password: '', treatment_start: todayISO(), therapist_id: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await api.createUser({ role: 'patient', ...f }); onDone(`اتضاف ${f.full_name}. ادّيله رقمه والباسورد عشان يدخل.`); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <b>مريض جديد</b>
      <div className="formgrid">
        <label className="field">الاسم<input id="np-name" value={f.full_name} onChange={set('full_name')} required /></label>
        <label className="field">رقم الموبايل<input id="np-phone" value={f.phone} onChange={set('phone')} inputMode="tel" dir="ltr" placeholder="01xxxxxxxxx" required /></label>
        <label className="field">باسورد مؤقت<input id="np-pass" value={f.password} onChange={set('password')} dir="ltr" minLength={8} required /></label>
        <label className="field">بداية العلاج<input id="np-start" type="date" value={f.treatment_start} onChange={set('treatment_start')} required /></label>
        {me.role === 'admin' && (
          <label className="field">الأخصائي المسؤول
            <select id="np-therapist" value={f.therapist_id} onChange={set('therapist_id')} required>
              <option value="">اختار</option>
              {staff.filter((s) => s.role === 'therapist').map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="small muted">المريض بيدخل برقم الموبايل والباسورد ده. أسبوع الاسترجاع بيتحسب من بداية العلاج.</div>
      {error && <div className="error">{error}</div>}
      <div className="row"><button className="btn" disabled={busy}>إضافة</button><button type="button" className="btn ghost" onClick={() => onDone('')}>إلغاء</button></div>
    </form>
  );
}

function AddStaff({ onDone }) {
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'therapist' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await api.createUser(f); onDone(`اتضاف ${f.full_name}.`); } catch (err) { setError(err.message); }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <b>دكتور / أخصائي جديد</b>
      <div className="formgrid">
        <label className="field">الاسم<input id="ns-name" value={f.full_name} onChange={set('full_name')} required /></label>
        <label className="field">الإيميل<input id="ns-email" type="email" value={f.email} onChange={set('email')} dir="ltr" required /></label>
        <label className="field">باسورد مؤقت<input id="ns-pass" value={f.password} onChange={set('password')} dir="ltr" minLength={8} required /></label>
        <label className="field">الصلاحية
          <select id="ns-role" value={f.role} onChange={set('role')}><option value="therapist">دكتور / أخصائي</option><option value="admin">أدمن</option></select>
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row"><button className="btn">إضافة</button><button type="button" className="btn ghost" onClick={() => onDone('')}>إلغاء</button></div>
    </form>
  );
}

export default function StaffHome({ me, go }) {
  const [tab, setTab] = useState('patients');
  const [patients, setPatients] = useState(null);
  const [staff, setStaff] = useState([]);
  const [pain, setPain] = useState([]);
  const [streaks, setStreaks] = useState({});
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    const [p, s, u] = await Promise.all([api.patients(), api.staff(), api.unseenPain()]);
    setPatients(p); setStaff(s); setPain(u);
    const entries = await Promise.all(p.map(async (x) => [x.id, await api.streak(x.id).catch(() => null)]));
    setStreaks(Object.fromEntries(entries));
  };
  useEffect(() => { load(); }, []);
  const done = (m) => { setAdding(false); setMsg(m); if (m) load(); };
  const nameOf = (id) => staff.find((s) => s.id === id)?.full_name ?? '—';
  const shown = (patients || []).filter((p) => !q || p.full_name.includes(q) || (p.phone || '').includes(q));

  return (
    <div className="page wide">
      <div className="top">
        <div className="logo"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" stroke="var(--on-teal)" strokeWidth="4" strokeLinecap="round" /></svg></div>
        <div><b>{me.full_name}</b><div className="muted small">{me.role === 'admin' ? 'أدمن' : 'دكتور / أخصائي'}</div></div>
        {api.demo && <span className="demo-badge">تجريبي</span>}
        <button className="btn ghost" style={{ marginInlineStart: api.demo ? 0 : 'auto' }} onClick={() => api.signOut()}>خروج</button>
      </div>
      {me.role === 'admin' && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'patients'} onClick={() => setTab('patients')}>المرضى</button>
          <button role="tab" aria-selected={tab === 'staff'} onClick={() => setTab('staff')}>الدكاترة والأخصائيين</button>
        </div>
      )}
      {msg && <div className="notice">{msg}</div>}

      {tab === 'patients' && (<>
        <div className="row spread">
          <h1 style={{ fontSize: 22 }}>{me.role === 'admin' ? 'كل المرضى' : 'مرضاك'}</h1>
          <div className="row">
            <input id="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو الرقم" style={{ width: 220 }} />
            {!adding && <button className="btn" onClick={() => setAdding(true)}>+ مريض جديد</button>}
          </div>
        </div>
        {adding && <AddPatient me={me} staff={staff} onDone={done} />}
        {patients === null ? <div className="muted">بيحمّل...</div> : shown.length === 0 ? <div className="card muted">مفيش مرضى لسه. دوس «مريض جديد».</div> : (
          <div className="stack">
            {shown.map((p) => {
              const cur = p.assignments.find((a) => a.active);
              const mineNow = me.role === 'admin' || cur?.therapist_id === me.id;
              const alerts = pain.filter((x) => x.patient_id === p.id).length;
              const st = streaks[p.id];
              return (
                <button key={p.id} className="prow" onClick={() => go('patient-' + p.id)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm">{p.full_name} {alerts > 0 && <span className="badge-red">ألم ({alerts})</span>}</div>
                    <div className="small muted"><span dir="ltr">{p.phone}</span>{me.role === 'admin' && ` · ${nameOf(cur?.therapist_id)}`}{!mineNow && ' · اتنقل لأخصائي تاني (قراءة بس)'}</div>
                  </div>
                  {st && <span className="chip rest">🔥 {st.streak}</span>}
                  {!p.onboarded && <span className="chip upcoming">لسه مادخلش</span>}
                  <span aria-hidden="true">‹</span>
                </button>
              );
            })}
          </div>
        )}
      </>)}

      {tab === 'staff' && me.role === 'admin' && (<>
        <div className="row spread"><h1 style={{ fontSize: 22 }}>الدكاترة والأخصائيين</h1>{!adding && <button className="btn" onClick={() => setAdding(true)}>+ إضافة</button>}</div>
        {adding && <AddStaff onDone={done} />}
        <div className="card table-wrap">
          <table><thead><tr><th>الاسم</th><th>الصلاحية</th><th>عدد المرضى</th></tr></thead><tbody>
            {staff.map((s) => (
              <tr key={s.id}><td>{s.full_name}</td><td>{s.role === 'admin' ? 'أدمن' : 'دكتور / أخصائي'}</td>
                <td>{(patients || []).filter((p) => p.assignments.some((a) => a.active && a.therapist_id === s.id)).length}</td></tr>
            ))}
          </tbody></table>
        </div>
      </>)}
    </div>
  );
}
