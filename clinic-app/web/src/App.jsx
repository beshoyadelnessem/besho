import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/index.js';
import { I18nContext, translate } from './i18n.js';
import { lookOf } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import PatientHome from './pages/PatientHome.jsx';
import ExerciseView from './pages/ExerciseView.jsx';
import PatientSettings from './pages/PatientSettings.jsx';
import PatientChat from './pages/Chat.jsx';
import StaffHome from './pages/StaffHome.jsx';
import StaffPatient from './pages/StaffPatient.jsx';
import Report from './pages/Report.jsx';
import OwnerHome from './pages/OwnerHome.jsx';

const useHash = () => {
  const [h, setH] = useState(location.hash.slice(1));
  useEffect(() => { const f = () => setH(location.hash.slice(1)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
};
const go = (h) => { location.hash = h; scrollTo(0, 0); };
const storedLang = () => { try { return localStorage.getItem('lang'); } catch { return null; } };
const browserLang = () => (navigator.language || 'en').slice(0, 2);
const initialLang = () => [storedLang(), browserLang()].find((l) => ['en', 'ar', 'de'].includes(l)) || 'en';

export default function App() {
  const [uid, setUid] = useState(undefined);
  const [me, setMe] = useState(null);
  const [library, setLibrary] = useState([]);
  const [error, setError] = useState('');
  const [lang, setLangState] = useState(initialLang);
  const hash = useHash();

  const setLang = useCallback((l) => { setLangState(l); try { localStorage.setItem('lang', l); } catch { /* private mode */ } }, []);
  const t = useCallback((k, v) => translate(lang, k, v), [lang]);
  const i18n = useMemo(() => ({ lang, t, setLang }), [lang, t, setLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  useEffect(() => { document.documentElement.classList.toggle('large', !!me?.large_text); }, [me?.large_text]);

  useEffect(() => {
    api.session().then(setUid);
    const sub = api.onAuth((id) => { setUid(id); go(''); });
    return () => sub.unsubscribe();
  }, []);
  const reload = useCallback(() => api.me().then((m) => { setMe(m); return m; }).catch((e) => setError(e.message)), []);
  useEffect(() => {
    setMe(null);
    if (uid) { reload().then((m) => m?.lang && setLang(m.lang)); api.exercises().then(setLibrary); }
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = useMemo(() => lookOf(me), [me?.gender, me?.birth_year, me?.avatar?.hijab]); // eslint-disable-line react-hooks/exhaustive-deps

  let view;
  if (uid === undefined) view = null;
  else if (!uid) view = <Login setLang={setLang} />;
  else if (error) view = <div className="page"><div className="error">{error}</div><button className="btn ghost" onClick={() => api.signOut()}>{t('signOut')}</button></div>;
  else if (!me) view = <div className="page muted">{t('loading')}</div>;
  else if (me.role === 'owner') view = <OwnerHome me={me} setLang={setLang} />;
  else if (me.role === 'patient') {
    if (!me.onboarded) view = <Onboarding me={me} onSaved={() => { reload(); go(''); }} />;
    else if (hash.startsWith('ex-')) view = <ExerciseView id={hash.slice(3)} look={look} library={library} go={go} />;
    else if (hash === 'prefs') view = <PatientSettings me={me} reload={reload} go={go} setLang={setLang} />;
    else if (hash === 'chat') view = <PatientChat me={me} go={go} />;
    else view = <PatientHome me={me} look={look} library={library} go={go} />;
  } else if (hash.startsWith('patient-')) view = <StaffPatient me={me} id={hash.slice(8)} library={library} go={go} />;
  else if (hash.startsWith('report-')) view = <Report id={hash.slice(7)} library={library} go={go} />;
  else view = <StaffHome me={me} go={go} library={library} setLang={setLang} />;

  return <I18nContext.Provider value={i18n}>{view}</I18nContext.Provider>;
}
