import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { exText, useI18n } from '../i18n.js';
import { DayStrip, PainChart } from '../components/ui.jsx';
import { eventText } from './StaffPatient.jsx';
import { addDays, ageFrom, clock, dateLabel, dateTime, holdLabel, todayISO } from '../lib/format.js';

// Printable one-page summary for the surgeon or the patient ("Save as PDF" in the print dialog).
export default function Report({ id, library, go }) {
  const { t, lang } = useI18n();
  const [d, setD] = useState(null);
  const from = addDays(todayISO(), -27);
  useEffect(() => {
    Promise.all([api.patient(id), api.prescriptions(id), api.days(id, from, todayISO()), api.streak(id),
      api.painScores(id, from), api.badges(id), api.events(id), api.staff(), api.clinics()])
      .then(([p, rx, days, streak, scores, badges, events, staff, clinics]) => setD({ p, rx, days, streak, scores, badges, events, staff, clinics }));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="page muted">{t('loading')}</div>;
  const { p, rx, days, streak, scores, badges, events, staff, clinics } = d;
  const byId = Object.fromEntries(library.map((e) => [e.slug, e]));
  const counts = days.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});
  const scored = (counts.done || 0) + (counts.missed || 0) + (counts.restored || 0);
  const therapist = staff.find((s) => s.id === p.assignments.find((a) => a.active)?.therapist_id);

  return (
    <div className="page wide report">
      <div className="row no-print">
        <button className="btn ghost" onClick={() => go('patient-' + id)}>{t('back')}</button>
        <button className="btn" onClick={() => window.print()}>{t('print')}</button>
      </div>
      <header className="row spread">
        <div><h1 style={{ fontSize: 24 }}>{t('reportTitle')}</h1><div className="muted">{clinics[0]?.name}</div></div>
        <div className="small muted" style={{ textAlign: 'end' }}>{t('generated', { date: dateLabel(todayISO(), lang) })}</div>
      </header>
      <div className="card formgrid">
        <div><div className="small muted">{t('name')}</div><b>{p.full_name}</b></div>
        <div><div className="small muted">{t('age')}</div><b>{ageFrom(p.birth_year) ?? '—'}</b></div>
        <div><div className="small muted">{t('startDate')}</div><b>{p.treatment_start ? dateLabel(p.treatment_start, lang) : '—'}</b></div>
        <div><div className="small muted">{t('therapist')}</div><b>{therapist?.full_name ?? '—'}</b></div>
        <div><div className="small muted">🔥</div><b>{streak.streak} {t('streakDays')}</b></div>
        <div><div className="small muted">{t('adherence')}</div><b>{t('fullDays', { n: scored ? Math.round(((counts.done || 0) / scored) * 100) : 0 })}</b></div>
      </div>
      <div className="card stack"><b>{t('adherence')}</b><DayStrip days={days} /></div>
      <div className="card stack"><b>{t('painChart')}</b>{scores.length ? <PainChart scores={scores} from={from} /> : <div className="small muted">{t('none')}</div>}</div>
      <div className="card stack">
        <b>{t('exercisesActive')}</b>
        <table><tbody>{rx.filter((r) => r.active).map((r) => (
          <tr key={r.id}><td>{clock(r.scheduled_time, lang)}</td><td><b>{exText(byId[r.exercise_slug], lang).name}</b></td>
            <td>{r.sets} × {r.reps}{r.hold_sec ? ` · ${holdLabel(r.hold_sec, lang)}` : ''}</td><td>{t('phaseN', { n: byId[r.exercise_slug]?.phase })}</td></tr>
        ))}</tbody></table>
      </div>
      <div className="card stack"><b>{t('badgesEarned')}</b><div className="row">{badges.length ? badges.map((b) => <span key={b.kind} className="chip">🏅 {t('badge_' + b.kind)}</span>) : <span className="small muted">{t('none')}</span>}</div></div>
      <div className="card stack"><b>{t('record')}</b>
        <ul className="timeline">{events.slice(0, 20).map((e) => <li key={e.id}><span className="small muted">{dateTime(e.created_at, lang)}</span><div>{eventText(e, t)}</div></li>)}</ul>
      </div>
    </div>
  );
}
