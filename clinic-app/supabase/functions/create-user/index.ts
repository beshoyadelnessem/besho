// Creates clinics and accounts, and resets passwords. Runs with the service role, after
// checking what the signed-in caller may do:
//   owner     -> create clinics (with their first admin); add admins/therapists to any clinic; reset staff passwords
//   admin     -> add admins, therapists and patients to their own clinic; reset passwords in their clinic
//   therapist -> add patients (assigned to themselves); reset their current patients' passwords
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// Error codes are translated by the web app.
const fail = (code: string, status = 400) => json({ error: code }, status);

const PATIENT_EMAIL_DOMAIN = Deno.env.get("PATIENT_EMAIL_DOMAIN") ?? "patients.invalid";
const LANGS = ["en", "ar", "de"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("method_not_allowed", 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return fail("not_signed_in", 401);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: me } = await db.from("profiles").select("id, role, clinic_id").eq("id", user.id).single();
  if (!me || me.role === "patient") return fail("not_allowed", 403);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return fail("bad_request"); }
  const password = String(body.password ?? "");
  if (password.length < 8) return fail("password_too_short");

  // ---------------------------------------------------------------- reset password
  if (body.action === "reset_password") {
    const { data: t } = await db.from("profiles").select("id, role, clinic_id").eq("id", String(body.user_id ?? "")).single();
    if (!t) return fail("not_found", 404);
    let allowed = false;
    if (me.role === "owner") allowed = t.role !== "patient";
    else if (me.role === "admin") allowed = t.clinic_id === me.clinic_id && t.role !== "owner";
    else if (t.role === "patient") {
      const { data: a } = await db.from("assignments").select("id")
        .eq("patient_id", t.id).eq("therapist_id", me.id).eq("active", true).maybeSingle();
      allowed = !!a;
    }
    if (!allowed) return fail("not_allowed", 403);
    const { error } = await db.auth.admin.updateUserById(t.id, { password });
    return error ? fail(error.message) : json({ ok: true });
  }

  const newAccount = async (email: string, fields: Record<string, unknown>) => {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      return { error: /already|registered|exists/i.test(error?.message ?? "") ? "already_registered" : (error?.message ?? "failed") };
    }
    const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, created_by: me.id, ...fields });
    if (pErr) { await db.auth.admin.deleteUser(data.user.id); return { error: pErr.message }; }
    return { id: data.user.id };
  };
  const fullName = String(body.full_name ?? "").trim();
  if (fullName.length < 2 || fullName.length > 80) return fail("name_required");
  const lang = LANGS.includes(body.lang) ? body.lang : "en";
  const email = String(body.email ?? "").trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // ---------------------------------------------------------------- new clinic (owner)
  if (body.action === "create_clinic") {
    if (me.role !== "owner") return fail("not_allowed", 403);
    const clinicName = String(body.clinic_name ?? "").trim();
    if (clinicName.length < 2) return fail("clinic_name_required");
    if (!emailOk) return fail("email_invalid");
    const tz = String(body.timezone ?? "Africa/Cairo");
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return fail("timezone_invalid"); }
    const { data: clinic, error } = await db.from("clinics").insert({ name: clinicName, timezone: tz }).select("id").single();
    if (error) return fail(error.message);
    const r = await newAccount(email, { role: "admin", clinic_id: clinic.id, full_name: fullName, lang, onboarded: true });
    if (r.error) { await db.from("clinics").delete().eq("id", clinic.id); return fail(r.error); }
    return json({ clinic_id: clinic.id, id: r.id });
  }

  // ---------------------------------------------------------------- new account
  const role = String(body.role ?? "");
  if (!["admin", "therapist", "patient"].includes(role)) return fail("role_invalid");
  if (me.role === "therapist" && role !== "patient") return fail("not_allowed", 403);
  if (me.role === "owner" && role === "patient") return fail("not_allowed", 403);
  const clinicId = me.role === "owner" ? String(body.clinic_id ?? "") : me.clinic_id;
  const { data: clinic } = await db.from("clinics").select("id, timezone").eq("id", clinicId).maybeSingle();
  if (!clinic) return fail("clinic_required");

  if (role !== "patient") {
    if (!emailOk) return fail("email_invalid");
    const r = await newAccount(email, { role, clinic_id: clinicId, full_name: fullName, lang, onboarded: true });
    return r.error ? fail(r.error) : json({ id: r.id });
  }

  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(phone)) return fail("phone_invalid");
  const therapistId = me.role === "therapist" ? me.id : String(body.therapist_id ?? "");
  const { data: th } = await db.from("profiles").select("id").eq("id", therapistId)
    .eq("clinic_id", clinicId).in("role", ["therapist", "admin"]).maybeSingle();
  if (!th) return fail("therapist_required");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timezone }).format(new Date());
  const start = /^\d{4}-\d{2}-\d{2}$/.test(body.treatment_start ?? "") ? body.treatment_start : today;
  const r = await newAccount(`${phone}@${PATIENT_EMAIL_DOMAIN}`,
    { role: "patient", clinic_id: clinicId, full_name: fullName, phone, lang, treatment_start: start });
  if (r.error) return fail(r.error);
  const { error: aErr } = await db.from("assignments").insert({ patient_id: r.id, therapist_id: therapistId });
  if (aErr) { await db.auth.admin.deleteUser(r.id!); return fail(aErr.message); }
  return json({ id: r.id });
});
