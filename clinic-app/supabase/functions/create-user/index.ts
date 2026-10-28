// Creates accounts and resets passwords. Runs server-side with the service role,
// after checking what the signed-in caller is allowed to do:
//   admin     -> create admins, therapists, patients; reset anyone's password
//   therapist -> create patients (assigned to themselves); reset their current patients' passwords
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PATIENT_EMAIL_DOMAIN = Deno.env.get("PATIENT_EMAIL_DOMAIN") ?? "patients.invalid";
const phoneToEmail = (phone: string) => `${phone}@${PATIENT_EMAIL_DOMAIN}`;
const cairoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "سجّل دخول الأول" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: me } = await admin.from("profiles").select("id, role").eq("id", user.id).single();
  if (!me || me.role === "patient") return json({ error: "مش مسموح" }, 403);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }
  const password = String(body.password ?? "");
  if (password.length < 8) return json({ error: "الباسورد لازم يكون 8 حروف أو أرقام على الأقل" }, 400);

  // ---- reset password
  if (body.action === "reset_password") {
    const target = String(body.user_id ?? "");
    const { data: t } = await admin.from("profiles").select("id, role").eq("id", target).single();
    if (!t) return json({ error: "الحساب مش موجود" }, 404);
    let allowed = me.role === "admin";
    if (!allowed && t.role === "patient") {
      const { data: a } = await admin.from("assignments").select("id")
        .eq("patient_id", target).eq("therapist_id", me.id).eq("active", true).maybeSingle();
      allowed = !!a;
    }
    if (!allowed) return json({ error: "مش مسموح" }, 403);
    const { error } = await admin.auth.admin.updateUserById(target, { password });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  // ---- create account
  const role = String(body.role ?? "");
  const fullName = String(body.full_name ?? "").trim();
  if (!["admin", "therapist", "patient"].includes(role)) return json({ error: "نوع الحساب غلط" }, 400);
  if (me.role === "therapist" && role !== "patient") return json({ error: "الأخصائي يضيف مرضى بس" }, 403);
  if (fullName.length < 2 || fullName.length > 80) return json({ error: "اكتب الاسم" }, 400);

  let email: string;
  let phone: string | null = null;
  let therapistId: string | null = null;
  if (role === "patient") {
    phone = String(body.phone ?? "").replace(/\D/g, "");
    if (!/^01[0125]\d{8}$/.test(phone)) return json({ error: "رقم الموبايل لازم يكون 11 رقم ويبدأ بـ 01" }, 400);
    email = phoneToEmail(phone);
    therapistId = me.role === "therapist" ? me.id : String(body.therapist_id ?? "");
    const { data: th } = await admin.from("profiles").select("id").eq("id", therapistId)
      .in("role", ["therapist", "admin"]).maybeSingle();
    if (!th) return json({ error: "اختار الأخصائي المسؤول" }, 400);
  } else {
    email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "الإيميل مش صحيح" }, 400);
  }
  const start = /^\d{4}-\d{2}-\d{2}$/.test(body.treatment_start ?? "") ? body.treatment_start : cairoToday();

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (authErr || !created.user) {
    const taken = /already|registered|exists/i.test(authErr?.message ?? "");
    return json({ error: taken ? "الرقم أو الإيميل ده متسجّل قبل كده" : (authErr?.message ?? "حصل خطأ") }, 400);
  }
  const id = created.user.id;
  const { error: profErr } = await admin.from("profiles").insert({
    id, role, full_name: fullName, phone, created_by: me.id,
    treatment_start: role === "patient" ? start : null,
  });
  if (!profErr && role === "patient") {
    const { error: asgErr } = await admin.from("assignments").insert({ patient_id: id, therapist_id: therapistId });
    if (asgErr) { await admin.auth.admin.deleteUser(id); return json({ error: asgErr.message }, 400); }
  }
  if (profErr) { await admin.auth.admin.deleteUser(id); return json({ error: profErr.message }, 400); }
  return json({ id });
});
