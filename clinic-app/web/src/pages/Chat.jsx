import { useEffect, useRef, useState } from 'react';
import { api } from '../api/index.js';
import { useI18n } from '../i18n.js';
import { ErrorBox, useError } from '../components/ui.jsx';
import { dateTime } from '../lib/format.js';
import { Icon } from '../components/icons.jsx';

// One conversation per patient. Used full-page by the patient and embedded in the staff view.
export function ChatThread({ patientId, meId, canWrite, names = {} }) {
  const { t, lang } = useI18n();
  const [msgs, setMsgs] = useState([]);
  const [body, setBody] = useState('');
  const [error, setError] = useError();
  const end = useRef(null);

  const load = async () => { setMsgs(await api.messages(patientId)); await api.markRead(patientId); };
  useEffect(() => { load().catch(setError); const i = setInterval(() => load().catch(() => {}), 15000); return () => clearInterval(i); }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    try { await api.sendMessage(patientId, body); setBody(''); await load(); } catch (err) { setError(err); }
  };

  return (
    <div className="stack">
      <div className="thread">
        {msgs.length === 0 && <div className="muted small">{t('none')}</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`bubble ${m.sender_id === meId ? 'mine' : ''}`}>
            {m.sender_id !== meId && names[m.sender_id] && <b className="small">{names[m.sender_id]}</b>}
            <div>{m.body}</div>
            <div className="small muted">{dateTime(m.created_at, lang)}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <ErrorBox error={error} />
      {canWrite ? (
        <form className="row composer" onSubmit={send}>
          <input id="chat-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('chatPh')} maxLength={1000} style={{ flex: 1 }} />
          <button className="btn">{t('send')}</button>
        </form>
      ) : <div className="small muted">{t('chatClosed')}</div>}
    </div>
  );
}

export default function PatientChat({ me, go }) {
  const { t, lang } = useI18n();
  return (
    <div className="page chat-page">
      <div className="top"><button className="btn ghost icon-btn" onClick={() => go('')} aria-label={t('back')}><Icon name="back" /></button><h1 style={{ fontSize: 20 }}>{t('chatWith')}</h1></div>
      <ChatThread patientId={me.id} meId={me.id} canWrite={me.chat_enabled} />
    </div>
  );
}
