import { createClient } from '@supabase/supabase-js';

const must = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };

export function createSupabaseApi(url, anonKey) {
  const sb = createClient(url, anonKey);
  let uid = null;

  const api = {
    demo: false,
    async session() { const { data } = await sb.auth.getSession(); uid = data.session?.user.id ?? null; return uid; },
    onAuth(cb) { return sb.auth.onAuthStateChange((_e, s) => { uid = s?.user.id ?? null; cb(uid); }).data.subscription; },
    // Staff sign in with their e-mail; patients with their chosen name or their phone number,
    // which the database maps to the account's sign-in address.
    async signIn(id, password) {
      const login = id.trim();
      const email = login.includes('@') ? login.toLowerCase() : await must(sb.rpc('login_email', { p_login: login }));
      if (!email) throw new Error('Invalid login credentials');
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    signOut: () => sb.auth.signOut(),

    me: () => must(sb.from('profiles').select('*').eq('id', uid).single()),
    updateMe: (fields) => must(sb.from('profiles').update(fields).eq('id', uid)),
    exercises: () => must(sb.from('exercises').select('*').order('sort')),

    // ---- patient
    todayPlan: () => must(sb.rpc('today_plan')),
    complete: (id) => must(sb.rpc('complete_exercise', { p_prescription: id })),
    reportPain: (note) => must(sb.rpc('report_pain', { p_note: note })),
    logPainScore: (score) => must(sb.rpc('log_pain_score', { p_score: score })),
    painScores: (pid, from) => must(sb.from('pain_scores').select('day, score').eq('patient_id', pid ?? uid).gte('day', from).order('day')),
    streak: (pid) => must(sb.rpc('streak_info', { p_patient: pid ?? uid })),
    restore: () => must(sb.rpc('restore_streak')),
    days: (pid, from, to) => must(sb.rpc('day_statuses', { p_patient: pid ?? uid, p_from: from, p_to: to })),
    badges: (pid) => must(sb.from('badges').select('kind, earned_at').eq('patient_id', pid ?? uid)),

    // ---- chat
    messages: (pid) => must(sb.from('messages').select('*').eq('patient_id', pid ?? uid).order('created_at')),
    sendMessage: (pid, body) => must(sb.rpc('send_message', { p_patient: pid ?? uid, p_body: body })),
    markRead: (pid) => must(sb.rpc('mark_messages_read', { p_patient: pid ?? uid })),
    async unread() {
      const rows = await must(sb.from('messages').select('patient_id, sender_id').is('read_at', null).neq('sender_id', uid));
      return rows.reduce((m, r) => ({ ...m, [r.patient_id]: (m[r.patient_id] || 0) + 1 }), {});
    },

    // ---- staff
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
    prescriptions: (pid) => must(sb.from('prescriptions').select('*').eq('patient_id', pid).order('scheduled_time')),
    addPrescription: (row) => must(sb.from('prescriptions').insert({ ...row, therapist_id: uid })),
    stopPrescription: (id) => must(sb.from('prescriptions').update({ active: false, ended_at: new Date().toISOString() }).eq('id', id)),
    painReports: (pid) => must(sb.from('pain_reports').select('*').eq('patient_id', pid).order('day', { ascending: false })),
    unseenPain: () => must(sb.from('pain_reports').select('patient_id').eq('seen', false)),
    markPainSeen: (id) => must(sb.from('pain_reports').update({ seen: true }).eq('id', id)),
    events: (pid) => must(sb.from('patient_events').select('*').eq('patient_id', pid).order('created_at', { ascending: false }).limit(100)),
    transfer: (pid, tid) => must(sb.rpc('transfer_patient', { p_patient: pid, p_therapist: tid })),
    setStart: (pid, day) => must(sb.rpc('set_treatment_start', { p_patient: pid, p_day: day })),
    setChat: (pid, on) => must(sb.rpc('set_chat', { p_patient: pid, p_on: on })),

    templates: () => must(sb.from('program_templates').select('*, template_items(*)').order('name')),
    saveTemplate: (pid, name) => must(sb.rpc('save_template_from_patient', { p_patient: pid, p_name: name })),
    applyTemplate: (pid, tid) => must(sb.rpc('apply_template', { p_patient: pid, p_template: tid })),
    deleteTemplate: (tid) => must(sb.from('program_templates').delete().eq('id', tid)),

    appointments: (pid) => {
      let q = sb.from('appointments').select('*').order('starts_at');
      if (pid) q = q.eq('patient_id', pid);
      return must(q);
    },
    async addAppointment(row) {
      const me = await api.me();
      return must(sb.from('appointments').insert({ ...row, clinic_id: me.clinic_id, created_by: uid }));
    },
    updateAppointment: (id, fields) => must(sb.from('appointments').update(fields).eq('id', id)),

    // ---- owner
    clinics: () => must(sb.from('clinics').select('*').order('name')),
    createClinic: (body) => api.createUser({ action: 'create_clinic', ...body }),

    async createUser(body) {
      const { data, error } = await sb.functions.invoke('create-user', { body });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch { /* keep the generic message */ }
        throw new Error(msg);
      }
      return data;
    },
    resetPassword: (userId, password) => api.createUser({ action: 'reset_password', user_id: userId, password }),
    patientSetup: (fullName, password) => api.createUser({ action: 'patient_setup', full_name: fullName, password }),
    deletePatient: (userId) => api.createUser({ action: 'delete_patient', user_id: userId }),
    patientPassword: (pid) => must(sb.from('patient_passwords').select('password, set_by, updated_at').eq('patient_id', pid).maybeSingle()),

    // ---- push
    async savePush(sub) {
      await must(sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint));
      await must(sb.from('push_subscriptions').insert({ patient_id: uid, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }));
    },
    dropPush: () => must(sb.from('push_subscriptions').delete().eq('patient_id', uid)),
    vapidKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || null,
  };
  return api;
}
