// Creates clinics and accounts, and resets passwords. Runs with the service role, after
// checking what the signed-in caller may do:
//   owner     -> create clinics (with their first admin); add admins/therapists to any clinic; reset staff passwords;
//                suspend / reactivate a clinic (its people cannot sign in meanwhile); delete a clinic with everyone in it
//   admin     -> add admins, therapists and patients to their own clinic; reset passwords in their clinic
//   therapist -> add patients (assigned to themselves); reset their current patients' passwords
//   admin/therapist -> delete the accounts of patients they manage
//   patient   -> first setup only: choose their own name (unique, it is also their login) and password
// Patient passwords are also stored for the patient's current therapist and clinic admin (0007).
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
  const { data: me } = await db.from("profiles").select("id, role, clinic_id, onboarded").eq("id", user.id).single();
  if (!me) return fail("not_allowed", 403);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return fail("bad_request"); }
  const password = String(body.password ?? "");
  const storePassword = (id: string, byPatient: boolean) =>
    db.rpc("_store_password", { p_patient: id, p_password: password, p_by_patient: byPatient });
  // Unique-index violations from the profiles insert/update, as error codes for the app.
  const dbError = (e: { code?: string; message: string }) =>
    e.code === "23505" ? (/phone/.test(e.message) ? "phone_taken" : "name_taken") : e.message;

  // ---------------------------------------------------------------- patient: first setup
  if (me.role === "patient") {
    if (body.action !== "patient_setup" || me.onboarded) return fail("not_allowed", 403);
    const name = String(body.full_name ?? "").trim().replace(/\s+/g, " ");
    if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]{1,39}$/u.test(name) || !/\p{L}/u.test(name)) return fail("name_invalid");
    if (password.length < 8) return fail("password_too_short");
    const { error: nErr } = await db.from("profiles").update({ full_name: name }).eq("id", me.id);
    if (nErr) return fail(dbError(nErr));
    const { error: pErr } = await db.auth.admin.updateUserById(me.id, { password });
    if (pErr) return fail(pErr.message);
    const { error: sErr } = await storePassword(me.id, true);
    return sErr ? fail(sErr.message) : json({ ok: true });
  }

  // ---------------------------------------------------------------- staff: may they manage this patient?
  const managesPatient = async (id: string) => {
    const { data: t } = await db.from("profiles").select("id, role, clinic_id").eq("id", id).maybeSingle();
    if (!t || t.role !== "patient") return null;
    if (me.role === "admin") return t.clinic_id === me.clinic_id ? t : null;
    if (me.role !== "therapist") return null;
    const { data: a } = await db.from("assignments").select("id")
      .eq("patient_id", t.id).eq("therapist_id", me.id).eq("active", true).maybeSingle();
    return a ? t : null;
  };

  // ---------------------------------------------------------------- delete a patient's account
  if (body.action === "delete_patient") {
    const t = await managesPatient(String(body.user_id ?? ""));
    if (!t) return fail("not_allowed", 403);
    // Deleting the sign-in account removes the profile and all of the patient's records.
    const { error } = await db.auth.admin.deleteUser(t.id);
    return error ? fail(error.message) : json({ ok: true });
  }

  // ---------------------------------------------------------------- owner: suspend / delete a clinic
  if (body.action === "set_clinic_active" || body.action === "delete_clinic") {
    if (me.role !== "owner") return fail("not_allowed", 403);
    const { data: clinic } = await db.from("clinics").select("id, name").eq("id", String(body.clinic_id ?? "")).maybeSingle();
    if (!clinic) return fail("not_found", 404);
    const { data: people, error: pErr } = await db.from("profiles").select("id, role").eq("clinic_id", clinic.id);
    if (pErr) return fail(pErr.message);

    if (body.action === "set_clinic_active") {
      const active = String(body.active) === "true";
      // A suspended clinic's staff and patients are banned from signing in until it is reactivated.
      for (const p of people ?? []) {
        const { error } = await db.auth.admin.updateUserById(p.id, { ban_duration: active ? "none" : "876000h" });
        if (error) return fail(error.message);
      }
      const { error } = await db.from("clinics").update({ active }).eq("id", clinic.id);
      return error ? fail(error.message) : json({ ok: true, people: people?.length ?? 0 });
    }

    if (String(body.confirm_name ?? "").trim() !== clinic.name) return fail("confirm_name_mismatch");
    // Patients first (their programs reference the therapists), then staff, then the clinic.
    await db.from("profiles").update({ created_by: null }).eq("clinic_id", clinic.id);
    const ordered = [...(people ?? [])].sort((a, b) => Number(b.role === "patient") - Number(a.role === "patient"));
    for (const p of ordered) {
      const { error } = await db.auth.admin.deleteUser(p.id);
      if (error) return fail(error.message);
    }
    const { error } = await db.from("clinics").delete().eq("id", clinic.id);
    return error ? fail(error.message) : json({ ok: true, deleted: ordered.length });
  }

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
    if (error) return fail(error.message);
    if (t.role === "patient") {
      const { error: sErr } = await storePassword(t.id, false);
      if (sErr) return fail(sErr.message);
    }
    return json({ ok: true });
  }

  const newAccount = async (email: string, fields: Record<string, unknown>) => {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      return { error: /already|registered|exists/i.test(error?.message ?? "") ? "already_registered" : (error?.message ?? "failed") };
    }
    const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, created_by: me.id, ...fields });
    if (pErr) { await db.auth.admin.deleteUser(data.user.id); return { error: dbError(pErr) }; }
    return { id: data.user.id };
  };
  const fullName = String(body.full_name ?? "").trim();
  const nameOk = fullName.length >= 2 && fullName.length <= 80;
  const lang = LANGS.includes(body.lang) ? body.lang : "en";
  const email = String(body.email ?? "").trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // ---------------------------------------------------------------- new clinic (owner)
  if (body.action === "create_clinic") {
    if (me.role !== "owner") return fail("not_allowed", 403);
    const clinicName = String(body.clinic_name ?? "").trim();
    if (clinicName.length < 2) return fail("clinic_name_required");
    if (!nameOk) return fail("name_required");
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
    if (!nameOk) return fail("name_required");
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
  // The patient chooses their real name at the first sign-in; until then the phone stands in.
  // The sign-in address is random so it reveals nothing (login_email() maps name/phone to it).
  const r = await newAccount(`p${crypto.randomUUID().replaceAll("-", "")}@${PATIENT_EMAIL_DOMAIN}`,
    { role: "patient", clinic_id: clinicId, full_name: nameOk ? fullName : phone, phone, lang, treatment_start: start });
  if (r.error) return fail(r.error);
  const { error: aErr } = await db.from("assignments").insert({ patient_id: r.id, therapist_id: therapistId });
  if (aErr) { await db.auth.admin.deleteUser(r.id!); return fail(aErr.message); }
  const { error: sErr } = await storePassword(r.id!, false);
  if (sErr) { await db.auth.admin.deleteUser(r.id!); return fail(sErr.message); }
  return json({ id: r.id });
});
