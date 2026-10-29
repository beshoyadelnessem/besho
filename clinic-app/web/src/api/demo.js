// In-browser stand-in for the Supabase backend, used when no Supabase project is
// configured. It mirrors the SQL rules (time windows, streak, restore, badges, chat,
// clinic isolation) so every screen can be tried without an account. Data resets on reload.
import LIBRARY from './demo-exercises.json';
import { cleanName, normName, validName } from '../lib/names.js';

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoLocal = (d) => `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const at = (day, time) => new Date(`${day}T${time}`);
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const H = 3600e3;
const BADGES = [['streak3', 3], ['streak7', 7], ['streak14', 14], ['streak30', 30]];

export function createDemoApi() {
  const now = () => new Date();
  const today = () => isoDay(now());
  const t0 = now();
  const slot = (h) => hhmm(new Date(t0.getTime() + h * H));
  const C1 = 'clinic-cairo', C2 = 'clinic-berlin';
  const db = {
    clinics: [
      { id: C1, name: 'Nile Physio Clinic', timezone: 'Africa/Cairo', active: true },
      { id: C2, name: 'Physio Berlin Mitte', timezone: 'Europe/Berlin', active: true },
    ],
    profiles: [
      { id: 'owner', role: 'owner', clinic_id: null, full_name: 'بيشوي', lang: 'ar' },
      { id: 'admin', role: 'admin', clinic_id: C1, full_name: 'د. سارة فؤاد', lang: 'ar' },
      { id: 't1', role: 'therapist', clinic_id: C1, full_name: 'د. محمد علي', lang: 'ar' },
      { id: 't2', role: 'therapist', clinic_id: C1, full_name: 'د. منى حسن', lang: 'ar' },
      { id: 'b-admin', role: 'admin', clinic_id: C2, full_name: 'Dr. Anna Weber', lang: 'de' },
      { id: 'p1', role: 'patient', clinic_id: C1, full_name: 'أحمد سمير', phone: '01001234567', gender: 'male', birth_year: new Date().getFullYear() - 27,
        avatar: {}, onboarded: true, notifications_enabled: true, chat_enabled: true, large_text: false, lang: 'ar', treatment_start: addDays(today(), -9) },
      { id: 'p2', role: 'patient', clinic_id: C1, full_name: 'نور الهدى محمود', phone: '01112223334', gender: 'female', birth_year: new Date().getFullYear() - 36,
        avatar: { hijab: true }, onboarded: true, notifications_enabled: true, chat_enabled: false, large_text: false, lang: 'ar', treatment_start: addDays(today(), -20) },
      { id: 'p3', role: 'patient', clinic_id: C1, full_name: 'كريم عادل', phone: '01223334445', onboarded: false, avatar: {},
        notifications_enabled: true, chat_enabled: false, large_text: false, lang: 'ar', treatment_start: today() },
      { id: 'p4', role: 'patient', clinic_id: C1, full_name: 'يوسف طارق', phone: '01009998887', gender: 'male', birth_year: new Date().getFullYear() - 11,
        avatar: {}, onboarded: true, notifications_enabled: true, chat_enabled: false, large_text: false, lang: 'ar', treatment_start: addDays(today(), -5) },
    ],
    assignments: [
      { id: 1, patient_id: 'p1', therapist_id: 't1', active: true, started_at: addDays(today(), -9) },
      { id: 2, patient_id: 'p2', therapist_id: 't2', active: false, started_at: addDays(today(), -20), ended_at: addDays(today(), -6) },
      { id: 3, patient_id: 'p2', therapist_id: 't1', active: true, started_at: addDays(today(), -6) },
      { id: 4, patient_id: 'p3', therapist_id: 't1', active: true, started_at: today() },
      { id: 5, patient_id: 'p4', therapist_id: 't2', active: true, started_at: addDays(today(), -5) },
    ],
    prescriptions: [], completions: [], pain: [], scores: [], restores: [], badges: [], events: [], messages: [],
    templates: [], appointments: [],
    // what the clinic sees in the patient's details (0007_patient_login.sql)
    passwords: {
      p1: { password: 'Ahmed-2026', set_by: 'patient' }, p2: { password: 'Nour.1990', set_by: 'patient' },
      p3: { password: 'Karim-1234', set_by: 'staff' }, p4: { password: 'Yousef-11', set_by: 'patient' },
    },
  };
  const nameTaken = (name, except) => db.profiles.some((x) => x.role === 'patient' && x.id !== except && normName(x.full_name) === normName(name));
  let nextId = 100;
  const rx = (patient_id, slug, time, extra = null, therapist = 't1') => {
    const e = LIBRARY.find((x) => x.slug === slug);
    const p = { id: nextId++, patient_id, therapist_id: therapist, exercise_slug: slug, sets: e.default_sets, reps: e.default_reps,
      hold_sec: e.default_hold_sec, scheduled_time: time, extra_caution: extra, active: true,
      created_at: addDays(today(), -30) + 'T00:00:00', ended_at: null };
    db.prescriptions.push(p);
    return p;
  };
  // Ahmed: one session in each state right now
  rx('p1', 'quadset', slot(-1));
  rx('p1', 'slr', slot(-0.5), 'ارفع لحد 30 سم بس الأسبوع ده.');
  rx('p1', 'heelslide', slot(-2.5), 'اثني لحد 90 درجة بس.');
  rx('p1', 'pumps', slot(-4));
  rx('p1', 'bridge', slot(3));
  rx('p2', 'squat', slot(-0.3)); rx('p2', 'balance', slot(5));
  rx('p4', 'quadset', slot(-0.2), null, 't2'); rx('p4', 'slr', slot(2), null, 't2');
  // history: Ahmed did everything 5 days, then missed yesterday; Nour is steady
  for (let d = -6; d <= -2; d++) for (const p of db.prescriptions.filter((x) => x.patient_id === 'p1')) {
    db.completions.push({ id: nextId++, prescription_id: p.id, patient_id: 'p1', day: addDays(today(), d), late: d === -3 });
  }
  db.completions.push({ id: nextId++, prescription_id: db.prescriptions[0].id, patient_id: 'p1', day: today(), late: false });
  for (let d = -12; d <= -1; d++) for (const p of db.prescriptions.filter((x) => x.patient_id === 'p2')) {
    db.completions.push({ id: nextId++, prescription_id: p.id, patient_id: 'p2', day: addDays(today(), d), late: false });
  }
  db.badges.push({ patient_id: 'p1', kind: 'streak3', earned_at: addDays(today(), -4) });
  for (const k of ['streak3', 'streak7']) db.badges.push({ patient_id: 'p2', kind: k, earned_at: addDays(today(), k === 'streak3' ? -9 : -5) });
  db.pain.push({ id: nextId++, patient_id: 'p2', day: addDays(today(), -2), note: 'الركبة ورمت شوية بعد التمرين', seen: false });
  [6, 5, 5, 4, 4, 3, 3, 4, 3, 2, 3, 2].forEach((s, i) => db.scores.push({ patient_id: 'p1', day: addDays(today(), i - 12), score: s }));
  [4, 4, 3, 3, 3, 2, 2, 2].forEach((s, i) => db.scores.push({ patient_id: 'p2', day: addDays(today(), i - 8), score: s }));
  const ev = (patient_id, kind, days, data = {}) => db.events.push({ id: nextId++, patient_id, kind, data, created_at: new Date(Date.now() + days * 864e5).toISOString() });
  ev('p1', 'badge', -4, { badge: 'streak3' }); ev('p1', 'chat_on', -3);
  ev('p2', 'transfer', -6); ev('p2', 'pain_report', -2); ev('p2', 'badge', -5, { badge: 'streak7' });
  ev('p4', 'missed_2_days', -1, { day: addDays(today(), -1) });
  db.messages.push(
    { id: nextId++, patient_id: 'p1', sender_id: 't1', body: 'أهلاً أحمد، عامل إيه مع التمارين؟', created_at: new Date(Date.now() - 26 * H).toISOString(), read_at: new Date().toISOString() },
    { id: nextId++, patient_id: 'p1', sender_id: 'p1', body: 'تمام يا دكتور، بس الركبة بتوجعني شوية في رفع الرجل.', created_at: new Date(Date.now() - 25 * H).toISOString(), read_at: new Date().toISOString() },
    { id: nextId++, patient_id: 'p1', sender_id: 't1', body: 'خفّف الارتفاع لحد 30 سم الأسبوع ده، وكتبتلك تنبيه في التمرين.', created_at: new Date(Date.now() - 3 * H).toISOString(), read_at: null },
  );
  db.templates.push({ id: nextId++, clinic_id: C1, name: 'ACL – Phase 1 (week 0–2)', created_by: 't1',
    template_items: ['quadset', 'slr', 'heelslide', 'pumps'].map((slug, i) => {
      const e = LIBRARY.find((x) => x.slug === slug);
      return { exercise_slug: slug, sets: e.default_sets, reps: e.default_reps, hold_sec: e.default_hold_sec, scheduled_time: `${pad(9 + i)}:00:00`, extra_caution: null };
    }) });
  const inDays = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  db.appointments.push(
    { id: nextId++, clinic_id: C1, patient_id: 'p1', therapist_id: 't1', starts_at: inDays(2, 11), duration_min: 45, status: 'booked', note: null },
    { id: nextId++, clinic_id: C1, patient_id: 'p1', therapist_id: 't1', starts_at: inDays(-5, 11), duration_min: 45, status: 'done', note: null },
    { id: nextId++, clinic_id: C1, patient_id: 'p2', therapist_id: 't1', starts_at: inDays(1, 17), duration_min: 30, status: 'booked', note: 'تقييم للمرحلة 2' },
  );

  // A demo page made for one role (tools/single-file.py --role) opens signed in as that role.
  const ROLE_USER = { patient: 'p1', 'new-patient': 'p3', therapist: 't1', admin: 'admin', owner: 'owner' };
  const lockedRole = typeof window !== 'undefined' ? window.__DEMO_ROLE__ : undefined;
  let uid = ROLE_USER[lockedRole] ?? null;
  const me = () => db.profiles.find((p) => p.id === uid);
  const prof = (id) => db.profiles.find((p) => p.id === id);
  const listeners = new Set();
  const delay = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 90));
  const fail = (m) => { throw new Error(m); };
  const isTherapistOf = (pid, current) => db.assignments.some((a) => a.patient_id === pid && a.therapist_id === uid && (a.active || !current));
  const canRead = (pid) => pid === uid || (me().role === 'admin' && prof(pid)?.clinic_id === me().clinic_id) || isTherapistOf(pid, false);
  const canManage = (pid) => (me().role === 'admin' && prof(pid)?.clinic_id === me().clinic_id) || isTherapistOf(pid, true);
  const guard = (pid) => { if (!canRead(pid)) fail('not_allowed'); };

  const occurrences = (pid, day) => db.prescriptions
    .filter((p) => p.patient_id === pid && new Date(p.created_at) <= at(day, p.scheduled_time)
      && (!p.ended_at || new Date(p.ended_at) > at(day, p.scheduled_time)))
    .map((p) => { const o = at(day, p.scheduled_time); return { p, opens: o, late: new Date(+o + 2 * H), closes: new Date(+o + 3 * H) }; });
  const done = (rxId, day) => db.completions.find((c) => c.prescription_id === rxId && c.day === day);
  const dayStatus = (pid, day) => {
    const start = prof(pid).treatment_start;
    if (start && day < start) return 'none';
    const occ = occurrences(pid, day);
    if (!occ.length) return 'none';
    if (db.pain.some((x) => x.patient_id === pid && x.day === day)) return 'rest';
    if (occ.every((o) => done(o.p.id, day))) return 'done';
    if (occ.some((o) => !done(o.p.id, day) && o.closes > now())) return 'pending';
    if (db.restores.some((r) => r.patient_id === pid && r.day === day)) return 'restored';
    return 'missed';
  };
  const streakInfo = (pid) => {
    const start = prof(pid).treatment_start || today();
    let d = today(), streak = 0, missed = null;
    while (d >= start) {
      const st = dayStatus(pid, d);
      if (st === 'missed') { missed = d; break; }
      if (st === 'done') streak++;
      d = addDays(d, -1);
    }
    const cycle = Math.max(0, Math.floor((new Date(today()) - new Date(start)) / 864e5 / 7));
    const used = db.restores.some((r) => r.patient_id === pid && r.cycle === cycle);
    return { streak, cycle, cycle_ends: addDays(start, (cycle + 1) * 7), restore_used_this_week: used,
      restorable_day: missed && missed >= addDays(today(), -1) && !used ? missed : null };
  };
  const awardBadges = (pid) => {
    const s = streakInfo(pid).streak, won = [];
    for (const [k, n] of BADGES) if (s >= n && !db.badges.some((b) => b.patient_id === pid && b.kind === k)) {
      db.badges.push({ patient_id: pid, kind: k, earned_at: now().toISOString() }); won.push(k);
      db.events.push({ id: nextId++, patient_id: pid, kind: 'badge', data: { badge: k }, created_at: now().toISOString() });
    }
    return won;
  };
  const event = (pid, kind, data = {}) => db.events.push({ id: nextId++, patient_id: pid, kind, data, created_at: now().toISOString() });

  const api = {
    demo: true,
    demoRole: lockedRole === 'new-patient' ? 'patient' : (lockedRole || null),
    async session() { return uid; },
    onAuth(cb) { listeners.add(cb); return { unsubscribe: () => listeners.delete(cb) }; },
    async signIn(id) {
      const p = db.profiles.find((x) => x.id === id);
      if (p?.clinic_id && db.clinics.find((c) => c.id === p.clinic_id)?.active === false) fail('clinic_suspended');
      uid = id; listeners.forEach((l) => l(uid));
    },
    async signOut() { uid = null; listeners.forEach((l) => l(uid)); },
    me: () => delay(me()),
    async updateMe(fields) {
      const m = me();
      if (m.onboarded && m.role === 'patient' && (('gender' in fields && fields.gender !== m.gender) || ('avatar' in fields && JSON.stringify(fields.avatar) !== JSON.stringify(m.avatar)))) {
        fail('gender and avatar are fixed after the first setup');
      }
      Object.assign(m, fields); return delay(null);
    },
    exercises: () => delay(LIBRARY),

    todayPlan() {
      const day = today();
      return delay(occurrences(uid, day).sort((a, b) => a.opens - b.opens).map(({ p, opens, late, closes }) => {
        const c = done(p.id, day); const n = now();
        return { prescription_id: p.id, exercise_slug: p.exercise_slug, sets: p.sets, reps: p.reps, hold_sec: p.hold_sec,
          extra_caution: p.extra_caution, opens_at: isoLocal(opens), late_at: isoLocal(late), closes_at: isoLocal(closes),
          state: c ? 'done' : n < opens ? 'upcoming' : n < late ? 'open' : n < closes ? 'late' : 'closed', late: c?.late ?? false };
      }));
    },
    async complete(id) {
      const o = occurrences(uid, today()).find((x) => x.p.id === id);
      if (!o || now() < o.opens || now() >= o.closes) fail('outside the allowed time window');
      const late = now() >= o.late;
      if (!done(id, today())) db.completions.push({ id: nextId++, prescription_id: id, patient_id: uid, day: today(), late });
      return delay({ late, new_badges: awardBadges(uid) });
    },
    async reportPain(note) {
      db.pain = db.pain.filter((x) => !(x.patient_id === uid && x.day === today()));
      db.pain.push({ id: nextId++, patient_id: uid, day: today(), note: note || null, seen: false });
      event(uid, 'pain_report', { day: today() });
      return delay(null);
    },
    async logPainScore(score) {
      db.scores = db.scores.filter((x) => !(x.patient_id === uid && x.day === today()));
      db.scores.push({ patient_id: uid, day: today(), score }); return delay(null);
    },
    painScores: (pid, from) => { guard(pid ?? uid); return delay(db.scores.filter((x) => x.patient_id === (pid ?? uid) && x.day >= from).sort((a, b) => a.day.localeCompare(b.day))); },
    streak: (pid) => { guard(pid ?? uid); return delay(streakInfo(pid ?? uid)); },
    async restore() {
      const s = streakInfo(uid);
      if (!s.restorable_day) fail('nothing to restore');
      db.restores.push({ patient_id: uid, day: s.restorable_day, cycle: s.cycle });
      event(uid, 'restore', { day: s.restorable_day });
      return delay(streakInfo(uid));
    },
    days(pid, from, to) {
      guard(pid ?? uid);
      const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, status: dayStatus(pid ?? uid, d) });
      return delay(out);
    },
    badges: (pid) => delay(db.badges.filter((b) => b.patient_id === (pid ?? uid))),

    messages: (pid) => { guard(pid ?? uid); return delay(db.messages.filter((m) => m.patient_id === (pid ?? uid))); },
    async sendMessage(pid, body) {
      const p = pid ?? uid;
      if (p === uid) { if (!me().chat_enabled) fail('chat is not enabled for you'); }
      else if (!canManage(p)) fail('not_allowed');
      db.messages.push({ id: nextId++, patient_id: p, sender_id: uid, body: body.trim(), created_at: now().toISOString(), read_at: null });
      return delay(null);
    },
    async markRead(pid) {
      const p = pid ?? uid;
      db.messages.filter((m) => m.patient_id === p && !m.read_at && (p === uid ? m.sender_id !== uid : m.sender_id === p))
        .forEach((m) => { m.read_at = now().toISOString(); });
      return delay(null);
    },
    unread() {
      const out = {};
      for (const m of db.messages) if (!m.read_at && m.sender_id !== uid && canRead(m.patient_id)) out[m.patient_id] = (out[m.patient_id] || 0) + 1;
      return delay(out);
    },

    patients() {
      return delay(db.profiles.filter((p) => p.role === 'patient' && p.id !== uid && canRead(p.id))
        .map((p) => ({ ...p, assignments: db.assignments.filter((a) => a.patient_id === p.id) })));
    },
    staff() {
      const r = me().role;
      return delay(db.profiles.filter((p) => ['admin', 'therapist'].includes(p.role) && (r === 'owner' || p.clinic_id === me().clinic_id)));
    },
    patient: (id) => { guard(id); return delay({ ...prof(id), assignments: db.assignments.filter((a) => a.patient_id === id) }); },
    prescriptions: (pid) => { guard(pid); return delay(db.prescriptions.filter((p) => p.patient_id === pid).sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))); },
    async addPrescription(row) {
      if (!canManage(row.patient_id)) fail('not_allowed');
      db.prescriptions.push({ id: nextId++, therapist_id: uid, active: true, created_at: now().toISOString(), ended_at: null, ...row });
      event(row.patient_id, 'rx_added', { slug: row.exercise_slug, by: uid });
      return delay(null);
    },
    // same record entries as the database trigger in 0008_program_history.sql
    async updatePrescription(id, fields) {
      const p = db.prescriptions.find((x) => x.id === id);
      if (!canManage(p.patient_id)) fail('not_allowed');
      const changes = {};
      for (const k of ['scheduled_time', 'sets', 'reps', 'hold_sec', 'extra_caution']) {
        if (k in fields && fields[k] !== p[k]) changes[k] = [p[k], fields[k]];
      }
      if ('active' in fields && fields.active !== p.active) event(p.patient_id, fields.active ? 'rx_resumed' : 'rx_stopped', { slug: p.exercise_slug, by: uid });
      Object.assign(p, fields);
      if (Object.keys(changes).length) event(p.patient_id, 'rx_changed', { slug: p.exercise_slug, by: uid, changes });
      return delay(null);
    },
    stopPrescription(id) { return api.updatePrescription(id, { active: false, ended_at: now().toISOString() }); },
    resumePrescription(id) { return api.updatePrescription(id, { active: true, ended_at: null }); },
    painReports: (pid) => { guard(pid); return delay(db.pain.filter((x) => x.patient_id === pid).sort((a, b) => b.day.localeCompare(a.day))); },
    unseenPain: () => delay(db.pain.filter((x) => !x.seen && canRead(x.patient_id))),
    async markPainSeen(id) { db.pain.find((x) => x.id === id).seen = true; return delay(null); },
    events: (pid) => { guard(pid); return delay(db.events.filter((e) => e.patient_id === pid).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
    async transfer(pid, tid) {
      db.assignments.filter((a) => a.patient_id === pid && a.active).forEach((a) => Object.assign(a, { active: false, ended_at: today() }));
      db.assignments.push({ id: nextId++, patient_id: pid, therapist_id: tid, active: true, started_at: today() });
      event(pid, 'transfer', { to: tid });
      return delay(null);
    },
    async setStart(pid, day) { prof(pid).treatment_start = day; return delay(null); },
    async setChat(pid, on) { if (!canManage(pid)) fail('not_allowed'); prof(pid).chat_enabled = on; event(pid, on ? 'chat_on' : 'chat_off'); return delay(null); },

    templates: () => delay(db.templates.filter((t) => t.clinic_id === me().clinic_id)),
    async saveTemplate(pid, name) {
      const items = db.prescriptions.filter((p) => p.patient_id === pid && p.active);
      if (!items.length) fail('no active exercises');
      db.templates.push({ id: nextId++, clinic_id: me().clinic_id, name, created_by: uid,
        template_items: items.map(({ exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution }) => ({ exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution })) });
      return delay(null);
    },
    async applyTemplate(pid, tid) {
      if (!canManage(pid)) fail('not_allowed');
      const t = db.templates.find((x) => x.id === tid);
      t.template_items.forEach((i) => db.prescriptions.push({ id: nextId++, patient_id: pid, therapist_id: uid, active: true, created_at: now().toISOString(), ended_at: null, ...i }));
      return delay(t.template_items.length);
    },
    async deleteTemplate(tid) { db.templates = db.templates.filter((t) => t.id !== tid); return delay(null); },

    appointments: (pid) => delay(db.appointments.filter((a) => (pid ? a.patient_id === pid : true) && (a.patient_id === uid || (me().role !== 'patient' && a.clinic_id === me().clinic_id)))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))),
    async addAppointment(row) {
      if (!canManage(row.patient_id)) fail('not_allowed');
      db.appointments.push({ id: nextId++, clinic_id: me().clinic_id, status: 'booked', duration_min: 45, ...row }); return delay(null);
    },
    async updateAppointment(id, fields) { Object.assign(db.appointments.find((a) => a.id === id), fields); return delay(null); },

    clinics: () => delay(me().role === 'owner' ? db.clinics : db.clinics.filter((c) => c.id === me().clinic_id)),
    async createClinic(body) {
      const id = 'c' + nextId++;
      db.clinics.push({ id, name: body.clinic_name, timezone: body.timezone || 'Africa/Cairo', active: true });
      db.profiles.push({ id: 'u' + nextId++, role: 'admin', clinic_id: id, full_name: body.full_name, email: body.email, lang: body.lang || 'en' });
      return delay({ clinic_id: id });
    },
    async setClinicActive(clinicId, active) {
      if (me().role !== 'owner') fail('not_allowed');
      db.clinics.find((c) => c.id === clinicId).active = active;
      return delay({ ok: true });
    },
    async deleteClinic(clinicId, confirmName) {
      if (me().role !== 'owner') fail('not_allowed');
      const c = db.clinics.find((x) => x.id === clinicId);
      if (confirmName.trim() !== c.name) fail('confirm_name_mismatch');
      for (const p of db.profiles.filter((x) => x.clinic_id === clinicId && x.role === 'patient')) await api.deletePatient(p.id);
      db.profiles = db.profiles.filter((x) => x.clinic_id !== clinicId);
      db.clinics = db.clinics.filter((x) => x.id !== clinicId);
      return delay({ ok: true });
    },
    async createUser(body) {
      if (body.password?.length < 8) fail('password_too_short');
      const patient = body.role === 'patient';
      const fullName = patient ? (cleanName(body.full_name) || String(body.phone || '').replace(/\D/g, '')) : body.full_name;
      if (patient && nameTaken(fullName)) fail('name_taken');
      if (patient && db.profiles.some((x) => x.phone && x.phone === String(body.phone).replace(/\D/g, ''))) fail('phone_taken');
      const id = 'u' + nextId++;
      const clinic = me().role === 'owner' ? body.clinic_id : me().clinic_id;
      if (patient) db.passwords[id] = { password: body.password, set_by: 'staff', updated_at: now().toISOString() };
      db.profiles.push({ id, role: body.role, clinic_id: clinic, full_name: fullName, phone: body.phone || null, email: body.email || null,
        onboarded: body.role !== 'patient', notifications_enabled: true, chat_enabled: false, large_text: false, avatar: {}, lang: body.lang || 'en',
        treatment_start: body.role === 'patient' ? (body.treatment_start || today()) : null });
      if (body.role === 'patient') db.assignments.push({ id: nextId++, patient_id: id, therapist_id: me().role === 'therapist' ? uid : body.therapist_id, active: true, started_at: today() });
      return delay({ id });
    },
    async resetPassword(userId, password) {
      if (password?.length < 8) fail('password_too_short');
      if (db.passwords[userId]) db.passwords[userId] = { password, set_by: 'staff', updated_at: now().toISOString() };
      return delay({ ok: true });
    },
    async patientSetup(fullName, password) {
      const name = cleanName(fullName);
      if (!validName(name)) fail('name_invalid');
      if (password?.length < 8) fail('password_too_short');
      if (nameTaken(name, uid)) fail('name_taken');
      me().full_name = name;
      db.passwords[uid] = { password, set_by: 'patient', updated_at: now().toISOString() };
      return delay({ ok: true });
    },
    patientPassword: (pid) => delay(db.passwords[pid] ?? null),
    async deletePatient(pid) {
      db.profiles = db.profiles.filter((x) => x.id !== pid);
      for (const k of ['assignments', 'prescriptions', 'completions', 'pain', 'scores', 'restores', 'badges', 'events', 'messages', 'appointments']) {
        db[k] = db[k].filter((x) => x.patient_id !== pid);
      }
      delete db.passwords[pid];
      return delay({ ok: true });
    },
    savePush: () => delay(null), dropPush: () => delay(null), vapidKey: null,
  };
  return api;
}
