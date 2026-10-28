import { useEffect, useMemo, useState } from 'react';
import { api } from './api/index.js';
import { lookOf } from './components/Figure.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import PatientHome from './pages/PatientHome.jsx';
import ExerciseView from './pages/ExerciseView.jsx';
import PatientSettings from './pages/PatientSettings.jsx';
import StaffHome from './pages/StaffHome.jsx';
import StaffPatient from './pages/StaffPatient.jsx';

const useHash = () => {
  const [h, setH] = useState(location.hash.slice(1));
  useEffect(() => { const f = () => setH(location.hash.slice(1)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
};
const go = (h) => { location.hash = h; scrollTo(0, 0); };

export default function App() {
  const [uid, setUid] = useState(undefined);
  const [me, setMe] = useState(null);
  const [library, setLibrary] = useState([]);
  const [error, setError] = useState('');
  const hash = useHash();

  useEffect(() => {
    api.session().then(setUid);
    const sub = api.onAuth((id) => { setUid(id); go(''); });
    return () => sub.unsubscribe();
  }, []);
  const reload = () => api.me().then(setMe).catch((e) => setError(e.message));
  useEffect(() => {
    setMe(null);
    if (uid) { reload(); api.exercises().then(setLibrary); }
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = useMemo(() => lookOf(me), [me]);

  if (uid === undefined) return null;
  if (!uid) return <Login />;
  if (error) return <div className="page"><div className="error">{error}</div><button className="btn ghost" onClick={() => api.signOut()}>خروج</button></div>;
  if (!me) return <div className="page muted">بيحمّل...</div>;

  if (me.role === 'patient') {
    if (!me.onboarded || hash === 'profile') return <Onboarding me={me} editing={me.onboarded} onSaved={() => { reload(); go(''); }} />;
    if (hash.startsWith('ex-')) return <ExerciseView id={hash.slice(3)} look={look} library={library} go={go} />;
    if (hash === 'prefs') return <PatientSettings me={me} reload={reload} go={go} />;
    return <PatientHome me={me} look={look} library={library} go={go} />;
  }
  if (hash.startsWith('patient-')) return <StaffPatient me={me} id={hash.slice(8)} library={library} go={go} />;
  return <StaffHome me={me} go={go} />;
}
