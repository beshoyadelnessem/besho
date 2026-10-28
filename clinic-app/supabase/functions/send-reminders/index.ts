// Sends a push reminder when a session's window opens. Scheduled every 5 minutes
// (see README). Protected by CRON_SECRET so only the scheduler can call it.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: due, error } = await db.rpc("due_reminders");
  if (error) return new Response(error.message, { status: 500 });

  const hhmm = (ts: string) => ts.slice(11, 16);
  let sent = 0;
  for (const r of due ?? []) {
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("patient_id", r.patient_id);
    const payload = JSON.stringify({
      title: `وقت تمرين: ${r.name_ar}`,
      body: `متاح دلوقتي لحد ${hhmm(r.late_at)} (وآخر فرصة ${hhmm(r.closes_at)})`,
      url: "/",
    });
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        sent++;
      } catch (e) {
        // subscription expired or revoked by the browser
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
    await db.from("reminders_sent").insert({ prescription_id: r.prescription_id, day: r.day });
  }
  return new Response(JSON.stringify({ due: due?.length ?? 0, sent }), { headers: { "Content-Type": "application/json" } });
});
