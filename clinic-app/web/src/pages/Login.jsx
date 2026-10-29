import { useState } from 'react';
import { api } from '../api/index.js';
import { useI18n } from '../i18n.js';
import { ErrorBox, LangSwitch, Logo, useError } from '../components/ui.jsx';

// Demo sign-in buttons; a demo page made for one role shows only that role's.
const DEMO_USERS = [
  { id: 'p1', role: 'patient', label: 'demoPatient' }, { id: 'p3', role: 'patient', label: 'demoNewPatient' },
  { id: 't1', role: 'therapist', label: 'demoTherapist' }, { id: 'admin', role: 'admin', label: 'demoAdmin' },
  { id: 'owner', role: 'owner', label: 'demoOwner' },
];

export default function Login({ setLang }) {
  const { t, lang } = useI18n();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useError();
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api.signIn(id, password); } catch (err) { setError(err); }
    setBusy(false);
  };

  return (
    <div className="page" style={{ maxWidth: 440, paddingTop: 32 }}>
      <div className="top">
        <Logo />
        <div><h1 style={{ fontSize: 22 }}>{t('appName')}</h1><div className="muted small">{t('tagline')}</div></div>
        <div style={{ marginInlineStart: 'auto' }}><LangSwitch value={lang} onChange={setLang} /></div>
      </div>
      {api.demo ? (
        <div className="card stack">
          <h2 style={{ fontSize: 18 }}>{t('demoTitle')}</h2>
          <p className="muted small" style={{ margin: 0 }}>{t('demoBody')}</p>
          {DEMO_USERS.filter((u) => !api.demoRole || u.role === api.demoRole).map((u, i) => (
            <button key={u.id} className={`btn ${i ? 'ghost ' : ''}block`}
              onClick={() => { setError(null); api.signIn(u.id).catch(setError); }}>{t(u.label)}</button>
          ))}
          <ErrorBox error={error} />
        </div>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <label className="field">{t('loginId')}
            <input id="login-id" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required dir="auto" />
          </label>
          <label className="field">{t('password')}
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required dir="ltr" />
          </label>
          <ErrorBox error={error} />
          <button className="btn block" disabled={busy}>{busy ? t('signingIn') : t('signIn')}</button>
          <p className="muted small" style={{ margin: 0 }}>{t('forgot')}</p>
        </form>
      )}
    </div>
  );
}
