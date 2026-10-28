// In-browser stand-in for the Supabase backend, used when no Supabase project is
// configured. It mirrors the SQL rules (time windows, streak, restore) so the
// screens can be tried without an account. Data resets on reload.
import LIBRARY from './demo-exercises.json';

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoLocal = (d) => `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };
const at = (day, time) => new Date(`${day}T${time}`);
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const H = 3600e3;

export function createDemoApi() {
  const now = () => new Date();
  const today = () => isoDay(now());
  const t0 = now();
  const slot = (offsetH) => hhmm(new Date(t0.getTime() + offsetH * H));
  const P1 = 'p1', P2 = 'p2', P3 = 'p3';
  const db = {
    profiles: [
      { id: 'admin', role: 'admin', full_name: 'د. سارة (الأدمن)', email: 'admin@clinic.example' },
      { id: 't1', role: 'therapist', full_name: 'د. محمد علي', email: 'mohamed@clinic.example' },
      { id: 't2', role: 'therapist', full_name: 'د. منى حسن', email: 'mona@clinic.example' },
      { id: P1, role: 'patient', full_name: 'أحمد سمير', phone: '01001234567', gender: 'male', birth_year: 1996,
        avatar: { skin: 2 }, onboarded: true, notifications_enabled: true, treatment_start: addDays(today(), -9) },
      { id: P2, role: 'patient', full_name: 'نور الهدى محمود', phone: '01112223334', gender: 'female', birth_year: 1989,
        avatar: { skin: 3, hijab: true }, onboarded: true, notifications_enabled: true, treatment_start: addDays(today(), -20) },
      { id: P3, role: 'patient', full_name: 'كريم عادل', phone: '01223334445', onboarded: false,
        notifications_enabled: true, treatment_start: today() },
    ],
    assignments: [
      { id: 1, patient_id: P1, therapist_id: 't1', active: true, started_at: addDays(today(), -9) },
      { id: 2, patient_id: P2, therapist_id: 't2', active: false, started_at: addDays(today(), -20), ended_at: addDays(today(), -6) },
      { id: 3, patient_id: P2, therapist_id: 't1', active: true, started_at: addDays(today(), -6) },
      { id: 4, patient_id: P3, therapist_id: 't1', active: true, started_at: today() },
    ],
    prescriptions: [], completions: [], pain: [], restores: [],
  };
  let nextId = 100;
  const rx = (patient_id, slug, time, extra = null, created = -30) => {
    const e = LIBRARY.find((x) => x.slug === slug);
    db.prescriptions.push({ id: nextId++, patient_id, therapist_id: 't1', exercise_slug: slug, sets: e.default_sets,
      reps: e.default_reps, hold_sec: e.default_hold_sec, scheduled_time: time, extra_caution_ar: extra, active: true,
      created_at: addDays(today(), created) + 'T00:00:00', ended_at: null });
  };
  // Ahmed: one session in each state right now
  rx(P1, 'quadset', slot(-1));
  rx(P1, 'slr', slot(-0.5), 'ارفع لحد 30 سم بس الأسبوع ده.');
  rx(P1, 'heelslide', slot(-2.5), 'اثني لحد 90 درجة بس.');
  rx(P1, 'pumps', slot(-4));
  rx(P1, 'bridge', slot(3));
  rx(P2, 'squat', slot(-0.3)); rx(P2, 'balance', slot(5));
  // history: Ahmed did everything for 5 days, then missed yesterday
  for (let d = -6; d <= -2; d++) for (const p of db.prescriptions.filter((x) => x.patient_id === P1)) {
    db.completions.push({ id: nextId++, prescription_id: p.id, patient_id: P1, day: addDays(today(), d), late: d === -3 });
  }
  db.completions.push({ id: nextId++, prescription_id: db.prescriptions[0].id, patient_id: P1, day: today(), late: false });
  for (let d = -10; d <= -1; d++) for (const p of db.prescriptions.filter((x) => x.patient_id === P2)) {
    db.completions.push({ id: nextId++, prescription_id: p.id, patient_id: P2, day: addDays(today(), d), late: false });
  }
  db.pain.push({ id: nextId++, patient_id: P2, day: addDays(today(), -2), note: 'الركبة ورمت شوية بعد التمرين', seen: false });

  let uid = null;
  const me = () => db.profiles.find((p) => p.id === uid);
  const listeners = new Set();
  const delay = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120));

  const occurrences = (pid, day) => db.prescriptions
    .filter((p) => p.patient_id === pid && new Date(p.created_at) <= at(day, p.scheduled_time)
      && (!p.ended_at || new Date(p.ended_at) > at(day, p.scheduled_time)))
    .map((p) => { const o = at(day, p.scheduled_time); return { p, opens: o, late: new Date(+o + 2 * H), closes: new Date(+o + 3 * H) }; });
  const done = (pid, day) => db.completions.find((c) => c.prescription_id === pid && c.day === day);
  const dayStatus = (pid, day) => {
    const start = db.profiles.find((p) => p.id === pid).treatment_start;
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
    const prof = db.profiles.find((p) => p.id === pid);
    const start = prof.treatment_start || today();
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
  const fail = (m) => { throw new Error(m); };

  return {
    demo: true,
    async session() { return uid; },
    onAuth(cb) { listeners.add(cb); return { unsubscribe: () => listeners.delete(cb) }; },
    async signIn(id) { uid = id; listeners.forEach((l) => l(uid)); },
    async signOut() { uid = null; listeners.forEach((l) => l(uid)); },
    me: () => delay(me()),
    async updateMe(fields) { Object.assign(me(), fields); return delay(null); },
    exercises: () => delay(LIBRARY),

    todayPlan() {
      const day = today();
      return delay(occurrences(uid, day).sort((a, b) => a.opens - b.opens).map(({ p, opens, late, closes }) => {
        const c = done(p.id, day); const n = now();
        return { prescription_id: p.id, exercise_slug: p.exercise_slug, sets: p.sets, reps: p.reps, hold_sec: p.hold_sec,
          extra_caution_ar: p.extra_caution_ar, opens_at: isoLocal(opens), late_at: isoLocal(late), closes_at: isoLocal(closes),
          state: c ? 'done' : n < opens ? 'upcoming' : n < late ? 'open' : n < closes ? 'late' : 'closed',
          completed_at: c ? n.toISOString() : null, late: c?.late ?? false };
      }));
    },
    async complete(id) {
      const o = occurrences(uid, today()).find((x) => x.p.id === id);
      if (!o || now() < o.opens || now() >= o.closes) fail('التمرين ده مش متاح دلوقتي');
      const late = now() >= o.late;
      if (!done(id, today())) db.completions.push({ id: nextId++, prescription_id: id, patient_id: uid, day: today(), late });
      return delay({ late });
    },
    async reportPain(note) {
      db.pain = db.pain.filter((x) => !(x.patient_id === uid && x.day === today()));
      db.pain.push({ id: nextId++, patient_id: uid, day: today(), note: note || null, seen: false });
      return delay(null);
    },
    streak: (pid) => delay(streakInfo(pid ?? uid)),
    async restore() {
      const s = streakInfo(uid);
      if (!s.restorable_day) fail('مفيش streak تسترجعه دلوقتي');
      db.restores.push({ patient_id: uid, day: s.restorable_day, cycle: s.cycle });
      return delay(streakInfo(uid));
    },
    days(pid, from, to) {
      const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, status: dayStatus(pid ?? uid, d) });
      return delay(out);
    },

    patients() {
      const role = me().role;
      const mine = (p) => role === 'admin' || db.assignments.some((a) => a.patient_id === p.id && a.therapist_id === uid);
      return delay(db.profiles.filter((p) => p.role === 'patient' && mine(p))
        .map((p) => ({ ...p, assignments: db.assignments.filter((a) => a.patient_id === p.id) })));
    },
    staff: () => delay(db.profiles.filter((p) => p.role !== 'patient')),
    patient: (id) => delay({ ...db.profiles.find((p) => p.id === id), assignments: db.assignments.filter((a) => a.patient_id === id) }),
    prescriptions: (pid) => delay(db.prescriptions.filter((p) => p.patient_id === pid).sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))),
    async addPrescription(row) {
      db.prescriptions.push({ id: nextId++, therapist_id: uid, active: true, created_at: now().toISOString(), ended_at: null, ...row });
      return delay(null);
    },
    async stopPrescription(id) { Object.assign(db.prescriptions.find((p) => p.id === id), { active: false, ended_at: now().toISOString() }); return delay(null); },
    painReports: (pid) => delay(db.pain.filter((x) => x.patient_id === pid).sort((a, b) => b.day.localeCompare(a.day))),
    unseenPain: () => delay(db.pain.filter((x) => !x.seen)),
    async markPainSeen(id) { db.pain.find((x) => x.id === id).seen = true; return delay(null); },
    async transfer(pid, tid) {
      db.assignments.filter((a) => a.patient_id === pid && a.active).forEach((a) => Object.assign(a, { active: false, ended_at: today() }));
      db.assignments.push({ id: nextId++, patient_id: pid, therapist_id: tid, active: true, started_at: today() });
      return delay(null);
    },
    async setStart(pid, day) { db.profiles.find((p) => p.id === pid).treatment_start = day; return delay(null); },
    async createUser(body) {
      const id = 'u' + nextId++;
      db.profiles.push({ id, role: body.role, full_name: body.full_name, phone: body.phone || null, email: body.email || null,
        onboarded: false, notifications_enabled: true, treatment_start: body.role === 'patient' ? (body.treatment_start || today()) : null });
      if (body.role === 'patient') db.assignments.push({ id: nextId++, patient_id: id, therapist_id: me().role === 'therapist' ? uid : body.therapist_id, active: true, started_at: today() });
      return delay({ id });
    },
    resetPassword: () => delay({ ok: true }),
    savePush: () => delay(null), dropPush: () => delay(null), vapidKey: null,
  };
}
