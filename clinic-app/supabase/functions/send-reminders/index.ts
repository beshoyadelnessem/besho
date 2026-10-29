// Every 5 minutes (see README): pushes a reminder when a session's window opens, and
// delivers queued notifications (encouragement after missed days, chat messages).
// Protected by CRON_SECRET so only the scheduler can call it.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const TEXT: Record<string, { title: (n: string) => string; body: (a: string, b: string) => string }> = {
  en: { title: (n) => `Time for: ${n}`, body: (a, b) => `Open now until ${a} (last chance ${b})` },
  ar: { title: (n) => `وقت تمرين: ${n}`, body: (a, b) => `متاح دلوقتي لحد ${a} (وآخر فرصة ${b})` },
  de: { title: (n) => `Zeit für: ${n}`, body: (a, b) => `Jetzt offen bis ${a} (letzte Chance ${b})` },
};

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let sent = 0;
  const push = async (patientId: string, title: string, body: string) => {
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("patient_id", patientId);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title, body, url: "/" }));
        sent++;
      } catch (e) {
        // the browser revoked or expired this subscription
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  };

  const { data: due, error } = await db.rpc("due_reminders");
  if (error) return new Response(error.message, { status: 500 });
  const hhmm = (ts: string) => ts.slice(11, 16);
  for (const r of due ?? []) {
    const t = TEXT[r.lang] ?? TEXT.en;
    const name = r.content?.[r.lang]?.name ?? r.content?.en?.name ?? "";
    await push(r.patient_id, t.title(name), t.body(hhmm(r.late_at), hhmm(r.closes_at)));
    await db.from("reminders_sent").insert({ prescription_id: r.prescription_id, day: r.day });
  }

  const { data: queued } = await db.from("notification_outbox").select("*").is("sent_at", null).order("created_at").limit(200);
  for (const n of queued ?? []) {
    await push(n.patient_id, n.title, n.body);
    await db.from("notification_outbox").update({ sent_at: new Date().toISOString() }).eq("id", n.id);
  }
  return new Response(JSON.stringify({ reminders: due?.length ?? 0, queued: queued?.length ?? 0, sent }),
    { headers: { "Content-Type": "application/json" } });
});
