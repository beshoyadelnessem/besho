import { createClient } from '@supabase/supabase-js';

const PATIENT_EMAIL_DOMAIN = import.meta.env.VITE_PATIENT_EMAIL_DOMAIN || 'patients.invalid';

// Patients sign in with their mobile number; it maps to a synthetic e-mail address.
export function loginEmail(id) {
  const digits = id.replace(/\D/g, '');
  return id.includes('@') ? id.trim().toLowerCase() : `${digits}@${PATIENT_EMAIL_DOMAIN}`;
}

const arabicError = (e) => {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'رقم الموبايل/الإيميل أو الباسورد غلط';
  if (/outside the allowed time window/i.test(m)) return 'التمرين ده مش متاح دلوقتي';
  if (/nothing to restore/i.test(m)) return 'مفيش streak تسترجعه دلوقتي';
  if (/duplicate key|streak_restores_patient_id_cycle/i.test(m)) return 'استخدمت الاسترجاع بتاع الأسبوع ده خلاص';
  return m;
};
const must = async (p) => { const { data, error } = await p; if (error) throw new Error(arabicError(error)); return data; };

export function createSupabaseApi(url, anonKey) {
  const sb = createClient(url, anonKey);
  let uid = null;

  const api = {
    demo: false,
    async session() { const { data } = await sb.auth.getSession(); uid = data.session?.user.id ?? null; return uid; },
    onAuth(cb) { return sb.auth.onAuthStateChange((_e, s) => { uid = s?.user.id ?? null; cb(uid); }).data.subscription; },
    async signIn(id, password) {
      const { error } = await sb.auth.signInWithPassword({ email: loginEmail(id), password });
      if (error) throw new Error(arabicError(error));
    },
    signOut: () => sb.auth.signOut(),

    me: () => must(sb.from('profiles').select('*').eq('id', uid).single()),
    updateMe: (fields) => must(sb.from('profiles').update(fields).eq('id', uid)),
    exercises: () => must(sb.from('exercises').select('*').order('sort')),

    // patient
    todayPlan: () => must(sb.rpc('today_plan')),
    complete: (id) => must(sb.rpc('complete_exercise', { p_prescription: id })),
    reportPain: (note) => must(sb.rpc('report_pain', { p_note: note })),
    streak: (patientId = uid) => must(sb.rpc('streak_info', { p_patient: patientId })),
    restore: () => must(sb.rpc('restore_streak')),
    days: (patientId, from, to) => must(sb.rpc('day_statuses', { p_patient: patientId ?? uid, p_from: from, p_to: to })),

    // staff
    async patients() {
      const [profiles, links] = await Promise.all([
        must(sb.from('profiles').select('*').eq('role', 'patient').order('full_name')),
        must(sb.from('assignments').select('*').order('started_at')),
      ]);
      return profiles.map((p) => ({ ...p, assignments: links.filter((a) => a.patient_id === p.id) }));
    },
    staff: () => must(sb.from('profiles').select('*').in('role', ['therapist', 'admin']).order('full_name')),
    patient: async (id) => ({
      ...(await must(sb.from('profiles').select('*').eq('id', id).single())),
      assignments: await must(sb.from('assignments').select('*').eq('patient_id', id).order('started_at')),
    }),
    prescriptions: (patientId) => must(sb.from('prescriptions').select('*').eq('patient_id', patientId).order('scheduled_time')),
    addPrescription: (row) => must(sb.from('prescriptions').insert({ ...row, therapist_id: uid })),
    stopPrescription: (id) => must(sb.from('prescriptions').update({ active: false, ended_at: new Date().toISOString() }).eq('id', id)),
    painReports: (patientId) => must(sb.from('pain_reports').select('*').eq('patient_id', patientId).order('day', { ascending: false })),
    unseenPain: () => must(sb.from('pain_reports').select('patient_id').eq('seen', false)),
    markPainSeen: (id) => must(sb.from('pain_reports').update({ seen: true }).eq('id', id)),
    transfer: (patientId, therapistId) => must(sb.rpc('transfer_patient', { p_patient: patientId, p_therapist: therapistId })),
    setStart: (patientId, day) => must(sb.rpc('set_treatment_start', { p_patient: patientId, p_day: day })),
    async createUser(body) {
      const { data, error } = await sb.functions.invoke('create-user', { body });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch { /* keep generic */ }
        throw new Error(msg);
      }
      return data;
    },
    resetPassword: (userId, password) => api.createUser({ action: 'reset_password', user_id: userId, password }),

    // push
    async savePush(sub) {
      await must(sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint));
      await must(sb.from('push_subscriptions').insert({
        patient_id: uid, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
      }));
    },
    dropPush: () => must(sb.from('push_subscriptions').delete().eq('patient_id', uid)),
    vapidKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || null,
  };
  return api;
}
