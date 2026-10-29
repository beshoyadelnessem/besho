import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { exText, useI18n } from '../i18n.js';
import { DayStrip, ErrorBox, Figure, Logo, useError } from '../components/ui.jsx';
import { addDays, clock, dateLabel, dateTime, dayName, todayISO } from '../lib/format.js';
import { Icon } from '../components/icons.jsx';

const BADGE_ORDER = ['streak3', 'streak7', 'streak14', 'streak30'];

export default function PatientHome({ me, look, library, go }) {
  const { t, lang } = useI18n();
  const [plan, setPlan] = useState(null);
  const [streak, setStreak] = useState(null);
  const [days, setDays] = useState([]);
  const [badges, setBadges] = useState([]);
  const [score, setScore] = useState(undefined);
  const [appt, setAppt] = useState(null);
  const [unread, setUnread] = useState(0);
  const [pain, setPain] = useState(false);
  const [painNote, setPainNote] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useError();

  const load = async () => {
    const d0 = todayISO();
    const [p, s, d, b, sc, ap, un] = await Promise.all([api.todayPlan(), api.streak(), api.days(null, addDays(d0, -13), d0),
      api.badges(), api.painScores(null, d0), api.appointments(), api.unread()]);
    setPlan(p); setStreak(s); setDays(d); setBadges(b.map((x) => x.kind));
    setScore(sc.find((x) => x.day === d0)?.score ?? null);
    setAppt(ap.find((a) => a.status === 'booked' && new Date(a.starts_at) > new Date()) || null);
    setUnread(Object.values(un).reduce((a, n) => a + n, 0));
  };
  useEffect(() => { load().catch(setError); const i = setInterval(() => load().catch(() => {}), 60000); return () => clearInterval(i); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, ok) => { setError(null); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e) { setError(e); } };
  const byId = Object.fromEntries((library || []).map((e) => [e.slug, e]));
  const doneCount = plan?.filter((p) => p.state === 'done').length ?? 0;
  const missed2 = days.length >= 3 && days[days.length - 2].status === 'missed' && days[days.length - 3].status === 'missed';

  return (
    <div className="page">
      <div className="top">
        <Logo />
        <div><b>{t('hello', { name: me.full_name.split(' ')[0] })}</b><div className="muted small">{dateLabel(todayISO(), lang)}</div></div>
        {api.demo && <span className="demo-badge">{t('demo')}</span>}
        <div className="row" style={{ marginInlineStart: api.demo ? 0 : 'auto' }}>
          {me.chat_enabled && (
            <button className="btn ghost icon-btn" onClick={() => go('chat')} aria-label={t('chat')}><Icon name="chat" />{unread > 0 && <span className="dot">{unread}</span>}</button>
          )}
          <button className="btn ghost icon-btn" onClick={() => go('prefs')} aria-label={t('settings')}><Icon name="settings" /></button>
        </div>
      </div>

      {missed2 && (
        <div className="cheer"><b>{t('missYou')}</b><div>{t('missYouBody')}</div></div>
      )}

      {streak && (
        <div className="streak">
          <svg width="44" height="52" viewBox="0 0 44 52" aria-hidden="true"><path d="M22 2c4 10 16 16 16 30a16 16 0 0 1-32 0c0-8 5-12 8-18 2 6 6 8 6 8 0-8 0-14 2-20z" fill="var(--flame)" /></svg>
          <div style={{ flex: 1 }}>
            <div className="num">{streak.streak}</div>
            <div className="small muted nowrap">{streak.streak === 1 ? t('streakDay') : t('streakDays')}</div>
          </div>
          <div className="small muted" style={{ textAlign: 'end' }}>
            {streak.restore_used_this_week ? t('restoreUsed') : t('restoreLeft')}
            <div>{t('weekRenews', { date: dateLabel(streak.cycle_ends, lang) })}</div>
          </div>
        </div>
      )}
      <div className="badges" aria-label={t('badges')}>
        {BADGE_ORDER.map((k) => (
          <span key={k} className={`badge ${badges.includes(k) ? 'won' : ''}`} title={t('badge_' + k)}>
            <Icon name="award" size={16} />{t('badge_' + k)}
          </span>
        ))}
      </div>
      {streak?.restorable_day && (
        <div className="restore">
          <div style={{ flex: 1, minWidth: 180 }}><b>{t('missedDay', { day: dayName(streak.restorable_day, lang) })}</b>
            <div className="small">{t('restoreHint')}</div></div>
          <button className="btn flame" onClick={() => act(() => api.restore(), t('restored'))}>{t('restoreBtn')}</button>
        </div>
      )}
      {msg && <div className="notice" role="status">{msg}</div>}
      <ErrorBox error={error} />

      {appt && (
        <div className="card row" style={{ gap: 12 }}>
          <span className="icon-tile"><Icon name="calendar" /></span>
          <div><b>{t('nextAppt')}</b><div className="small">{dateTime(appt.starts_at, lang)}</div></div>
        </div>
      )}

      <div className="row spread">
        <h2 style={{ fontSize: 18 }}>{t('today')}</h2>
        {plan && <span className="chip">{t('ofN', { done: doneCount, total: plan.length })}</span>}
      </div>
      {plan?.length === 0 && <div className="card muted">{t('noExercises')}</div>}
      <div className="stack">
        {plan?.map((s) => {
          const ex = byId[s.exercise_slug];
          const locked = s.state === 'upcoming' || s.state === 'closed';
          return (
            <button key={s.prescription_id} className={`session ${s.state} ${locked ? 'locked' : ''}`}
              onClick={() => (locked ? setMsg(s.state === 'upcoming' ? t('opensAt', { time: clock(s.opens_at, lang) }) : t('closedMsg')) : go('ex-' + s.prescription_id))}>
              <div className="thumb">{ex && <Figure slug={ex.slug} look={look} still />}</div>
              <div className="info">
                <div className="nm">{exText(ex, lang).name}</div>
                <div className="small muted nowrap">{t('window', { from: clock(s.opens_at, lang), to: clock(s.late_at, lang) })}</div>
                {s.state !== 'done' && s.state !== 'closed' && <div className="small muted nowrap">{t('lastChance', { time: clock(s.closes_at, lang) })}</div>}
                <span className={`chip ${s.state}`}>{s.state === 'done' && <Icon name="check" size={14} />}{t('st_' + s.state)}{s.state === 'done' && s.late ? ` (${t('late')})` : ''}</span>
              </div>
              <span className="go">{locked ? <Icon name="lock" size={20} /> : <Icon name="chevron" size={20} />}</span>
            </button>
          );
        })}
      </div>

      <div className="card stack">
        <b>{t('scoreQ')}</b>
        {score !== null && score !== undefined && <div className="small muted">{t('scoreToday', { n: score })}</div>}
        <div className="scale" role="group" aria-label={t('scoreQ')}>
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" aria-pressed={score === n} style={{ '--h': `${120 - n * 12}` }}
              onClick={() => act(() => api.logPainScore(n), t('scoreSaved'))}>{n}</button>
          ))}
        </div>
        <div className="row spread small muted"><span>0 · {t('scoreLow')}</span><span>10 · {t('scoreHigh')}</span></div>
      </div>

      <div className="card stack">
        <b>{t('last14')}</b>
        <DayStrip days={days} />
        <div className="row small"><span className="chip done">{t('dDone')}</span><span className="chip missed">{t('dMissed')}</span><span className="chip rest">{t('dRest')}</span></div>
      </div>

      {!pain ? (
        <button className="btn danger block" onClick={() => setPain(true)}>{t('painBtn')}</button>
      ) : (
        <div className="card stack" style={{ borderColor: 'var(--red)' }}>
          <b>{t('painTitle')}</b>
          <div className="small muted">{t('painBody')}</div>
          <textarea id="pain-note" value={painNote} onChange={(e) => setPainNote(e.target.value)} placeholder={t('painPh')} />
          <div className="row">
            <button className="btn danger" onClick={() => act(() => api.reportPain(painNote), t('painSent')).then(() => setPain(false))}>{t('painSend')}</button>
            <button className="btn ghost" onClick={() => setPain(false)}>{t('cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
