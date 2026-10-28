import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import Figure from '../components/Figure.jsx';
import { STATE_LABEL, DAY_LABEL, addDays, clock, dateLabel, dayName, todayISO } from '../lib/format.js';

export default function PatientHome({ me, look, library, go }) {
  const [plan, setPlan] = useState(null);
  const [streak, setStreak] = useState(null);
  const [days, setDays] = useState([]);
  const [pain, setPain] = useState(false);
  const [painNote, setPainNote] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const t = todayISO();
    const [p, s, d] = await Promise.all([api.todayPlan(), api.streak(), api.days(null, addDays(t, -13), t)]);
    setPlan(p); setStreak(s); setDays(d);
  };
  useEffect(() => { load().catch((e) => setError(e.message)); const i = setInterval(load, 60000); return () => clearInterval(i); }, []);

  const restore = async () => {
    setError('');
    try { await api.restore(); setMsg('رجّعنا الـ streak بتاعك 🔥 خلّي بالك، ده الاسترجاع الوحيد للأسبوع ده.'); await load(); } catch (e) { setError(e.message); }
  };
  const sendPain = async () => {
    try { await api.reportPain(painNote); setPain(false); setMsg('بلّغنا الأخصائي. النهارده يوم راحة، والـ streak بتاعك محفوظ.'); await load(); } catch (e) { setError(e.message); }
  };

  const byId = Object.fromEntries((library || []).map((e) => [e.slug, e]));
  const doneCount = plan?.filter((p) => p.state === 'done').length ?? 0;

  return (
    <div className="page">
      <div className="top">
        <div className="logo"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" stroke="var(--on-teal)" strokeWidth="4" strokeLinecap="round" /></svg></div>
        <div><b>أهلاً يا {me.full_name.split(' ')[0]}</b><div className="muted small">{dateLabel(todayISO())}</div></div>
        {api.demo && <span className="demo-badge">تجريبي</span>}
        <button className="btn ghost" style={{ marginInlineStart: api.demo ? 0 : 'auto' }} onClick={() => go('settings')} aria-label="الإعدادات">⚙︎</button>
      </div>

      {streak && (
        <div className="streak">
          <svg width="44" height="52" viewBox="0 0 44 52" aria-hidden="true"><path d="M22 2c4 10 16 16 16 30a16 16 0 0 1-32 0c0-8 5-12 8-18 2 6 6 8 6 8 0-8 0-14 2-20z" fill="var(--flame)" /></svg>
          <div style={{ flex: 1 }}>
            <div className="num">{streak.streak}</div>
            <div className="small muted">{streak.streak === 1 ? 'يوم' : 'أيام'} ورا بعض</div>
          </div>
          <div className="small muted" style={{ textAlign: 'end' }}>
            {streak.restore_used_this_week ? 'استخدمت استرجاع الأسبوع ده' : 'عندك استرجاع واحد الأسبوع ده'}
            <div>الأسبوع يتجدد {dateLabel(streak.cycle_ends)}</div>
          </div>
        </div>
      )}
      {streak?.restorable_day && (
        <div className="restore">
          <div style={{ flex: 1, minWidth: 180 }}><b>فوّت تمارين يوم {dayName(streak.restorable_day)} والـ streak وقع.</b>
            <div className="small">تقدر ترجّعه دلوقتي، ومعاك مرة واحدة بس في الأسبوع.</div></div>
          <button className="btn flame" onClick={restore}>رجّع الـ streak</button>
        </div>
      )}
      {msg && <div className="notice">{msg}</div>}
      {error && <div className="error">{error}</div>}

      <div className="row spread">
        <h2 style={{ fontSize: 18 }}>تمارين النهارده</h2>
        {plan && <span className="chip">{doneCount} من {plan.length}</span>}
      </div>
      {plan?.length === 0 && <div className="card muted">مفيش تمارين النهارده. الأخصائي هيضيفلك برنامجك.</div>}
      <div className="stack">
        {plan?.map((s) => {
          const ex = byId[s.exercise_slug];
          const locked = s.state === 'upcoming' || s.state === 'closed';
          return (
            <button key={s.prescription_id} className={`session ${s.state} ${locked ? 'locked' : ''}`}
              onClick={() => (locked ? setMsg(s.state === 'upcoming' ? `التمرين ده بيفتح الساعة ${clock(s.opens_at)}.` : 'وقت التمرين ده خلص واتقفل.') : go('ex-' + s.prescription_id))}>
              <div className="thumb">{ex && <Figure slug={ex.slug} look={look} still />}</div>
              <div className="info">
                <div className="nm">{ex?.name_ar}</div>
                <div className="small muted">{clock(s.opens_at)} – {clock(s.late_at)}{s.state !== 'done' && ` · آخر فرصة ${clock(s.closes_at)}`}</div>
                <span className={`chip ${s.state}`}>{STATE_LABEL[s.state]}{s.state === 'done' && s.late ? ' (متأخر)' : ''}</span>
              </div>
              <span aria-hidden="true" style={{ fontSize: 20 }}>{locked ? '🔒' : '‹'}</span>
            </button>
          );
        })}
      </div>

      <div className="card stack">
        <b>آخر 14 يوم</b>
        <div className="days">
          {days.map((d) => <span key={d.day} className={d.status} title={`${dateLabel(d.day)}: ${DAY_LABEL[d.status]}`}>{Number(d.day.slice(8))}</span>)}
        </div>
        <div className="row small muted">
          <span className="chip done">خلّص</span><span className="chip missed">فوّت</span><span className="chip rest">راحة / اتسترجع</span>
        </div>
      </div>

      {!pain ? (
        <button className="btn danger block" onClick={() => setPain(true)}>عندي ألم / مش قادر أتمرن النهارده</button>
      ) : (
        <div className="card stack" style={{ borderColor: 'var(--red)' }}>
          <b>هنبلّغ الأخصائي بتاعك</b>
          <div className="small muted">النهارده هيتحسب يوم راحة والـ streak مش هيقع. لو الألم شديد جدًا أو الركبة سخنة وحمرا، كلّم العيادة أو الطوارئ على طول.</div>
          <textarea id="pain-note" value={painNote} onChange={(e) => setPainNote(e.target.value)} placeholder="اكتب حاسس بإيه (اختياري)" />
          <div className="row"><button className="btn danger" onClick={sendPain}>بلّغ الأخصائي</button><button className="btn ghost" onClick={() => setPain(false)}>إلغاء</button></div>
        </div>
      )}
    </div>
  );
}
