import { useState } from 'react';
import { api } from '../api/index.js';

const b64ToBytes = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export default function PatientSettings({ me, reload, go }) {
  const [on, setOn] = useState(me.notifications_enabled);
  const [note, setNote] = useState('');

  const toggle = async () => {
    const next = !on;
    setNote('');
    try {
      if (next && api.vapidKey && 'serviceWorker' in navigator && 'PushManager' in window) {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { setNote('لازم تسمح بالإشعارات من إعدادات المتصفح.'); return; }
        const reg = await navigator.serviceWorker.register('/sw.js');
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(api.vapidKey) });
        await api.savePush(sub.toJSON());
      } else if (!next) {
        await api.dropPush();
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
      } else if (next && !api.vapidKey) {
        setNote(api.demo ? 'في النسخة التجريبية الإشعارات مش بتتبعت فعلًا.' : 'الإشعارات لسه مش متفعّلة من العيادة.');
      }
      await api.updateMe({ notifications_enabled: next });
      setOn(next); reload();
    } catch (e) {
      setNote(/iPhone|iPad/.test(navigator.userAgent)
        ? 'على الآيفون: افتح الموقع من Safari، دوس مشاركة ← Add to Home Screen، وافتحه من الأيقونة وفعّل الإشعارات.'
        : e.message);
    }
  };

  return (
    <div className="page">
      <div className="top"><button className="btn ghost" onClick={() => go('')} aria-label="رجوع">→</button><h1 style={{ fontSize: 20 }}>الإعدادات</h1></div>
      <div className="card toggle">
        <div><b>إشعارات التمارين</b><div className="small muted">نفكّرك أول ما وقت كل تمرين يفتح.</div></div>
        <button className="switch" role="switch" aria-checked={on} aria-label="إشعارات التمارين" onClick={toggle} />
      </div>
      {note && <div className="notice small">{note}</div>}
      <button className="btn ghost block" onClick={() => go('profile')}>تعديل بياناتي وشكلي</button>
      <div className="card small muted">رقم الموبايل: <span dir="ltr">{me.phone}</span></div>
      <button className="btn danger block" onClick={() => api.signOut()}>خروج</button>
    </div>
  );
}
