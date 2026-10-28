import { useState } from 'react';
import { api } from '../api/index.js';

export default function Login() {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api.signIn(id, password); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="page" style={{ maxWidth: 420, paddingTop: 40 }}>
      <div className="top">
        <div className="logo"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" stroke="var(--on-teal)" strokeWidth="4" strokeLinecap="round" /></svg></div>
        <div><h1 style={{ fontSize: 22 }}>تمارين البيت</h1><div className="muted small">برنامج العلاج الطبيعي بتاعك</div></div>
      </div>
      {api.demo ? (
        <div className="card stack">
          <h2 style={{ fontSize: 18 }}>نسخة تجريبية</h2>
          <p className="muted small" style={{ margin: 0 }}>لسه مافيش قاعدة بيانات متوصلة. جرّب السيستم بأي دور من دول، والبيانات أمثلة بتتمسح لما تعمل refresh.</p>
          <button className="btn block" onClick={() => api.signIn('p1')}>ادخل كمريض (أحمد)</button>
          <button className="btn ghost block" onClick={() => api.signIn('p3')}>ادخل كمريض جديد (أول مرة)</button>
          <button className="btn ghost block" onClick={() => api.signIn('t1')}>ادخل كأخصائي (د. محمد)</button>
          <button className="btn ghost block" onClick={() => api.signIn('admin')}>ادخل كأدمن</button>
        </div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <label className="field">رقم الموبايل أو الإيميل
            <input id="login-id" value={id} onChange={(e) => setId(e.target.value)} inputMode="email" autoComplete="username" required dir="ltr" />
          </label>
          <label className="field">الباسورد
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required dir="ltr" />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn block" disabled={busy}>{busy ? 'بيدخل...' : 'دخول'}</button>
          <p className="muted small" style={{ margin: 0 }}>نسيت الباسورد؟ كلّم الأخصائي بتاعك يعملك واحد جديد.</p>
        </form>
      )}
    </div>
  );
}
