import { useState } from 'react';
import { api } from '../api/index.js';
import { useI18n } from '../i18n.js';
import { ErrorBox, LangSwitch, useError } from '../components/ui.jsx';

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

function Toggle({ id, label, body, on, onToggle }) {
  return (
    <div className="card toggle">
      <div><b>{label}</b><div className="small muted">{body}</div></div>
      <button id={id} className="switch" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} />
    </div>
  );
}

export default function PatientSettings({ me, reload, go, setLang }) {
  const { t, lang } = useI18n();
  const [note, setNote] = useState('');
  const [age, setAge] = useState(me.birth_year ? String(new Date().getFullYear() - me.birth_year) : '');
  const [error, setError] = useError();

  const save = async (fields, ok) => { setError(null); try { await api.updateMe(fields); await reload(); if (ok) setNote(ok); } catch (e) { setError(e); } };

  const toggleNotifications = async () => {
    const next = !me.notifications_enabled;
    setNote('');
    try {
      if (next && api.vapidKey && 'serviceWorker' in navigator && 'PushManager' in window) {
        if (await Notification.requestPermission() !== 'granted') { setNote(t('notifDenied')); return; }
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(api.vapidKey) });
        await api.savePush(sub.toJSON());
      } else if (!next) {
        await api.dropPush();
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
      } else if (!api.vapidKey) {
        setNote(api.demo ? t('notifDemo') : t('notifOff'));
      }
      await save({ notifications_enabled: next });
    } catch (e) {
      if (/iPhone|iPad/.test(navigator.userAgent)) setNote(t('notifIphone')); else setError(e);
    }
  };

  return (
    <div className="page">
      <div className="top"><button className="btn ghost icon-btn" onClick={() => go('')} aria-label={t('back')}>{lang === 'ar' ? '→' : '←'}</button><h1 style={{ fontSize: 20 }}>{t('settings')}</h1></div>
      <div className="card toggle"><b>{t('language')}</b><LangSwitch value={lang} onChange={(l) => { setLang(l); save({ lang: l }); }} /></div>
      <Toggle id="sw-notif" label={t('notifications')} body={t('notifBody')} on={me.notifications_enabled} onToggle={toggleNotifications} />
      <Toggle id="sw-large" label={t('largeText')} body={t('largeBody')} on={me.large_text} onToggle={() => save({ large_text: !me.large_text })} />
      <div className="card stack">
        <label className="field">{t('changeAge')}
          <input id="set-age" type="number" min="5" max="100" value={age} onChange={(e) => setAge(e.target.value)} />
        </label>
        <button className="btn ghost" disabled={!(Number(age) >= 5 && Number(age) <= 100)}
          onClick={() => save({ birth_year: new Date().getFullYear() - Number(age) }, t('scoreSaved'))}>{t('save')}</button>
      </div>
      {note && <div className="notice small" role="status">{note}</div>}
      <ErrorBox error={error} />
      <div className="card small muted">{t('mobile')}: <span dir="ltr">{me.phone}</span></div>
      <button className="btn danger block" onClick={() => api.signOut()}>{t('signOut')}</button>
    </div>
  );
}
