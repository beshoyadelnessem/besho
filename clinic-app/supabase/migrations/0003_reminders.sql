-- Sessions whose window opened in the last 15 minutes and still need a push reminder.
-- Called only by the send-reminders Edge Function (service role).
create or replace function public.due_reminders()
returns table (prescription_id bigint, patient_id uuid, day date, name_ar text, opens_at timestamp, late_at timestamp, closes_at timestamp)
language sql stable security definer set search_path = public as $$
  select p.id, p.patient_id, (public.local_now())::date, e.name_ar,
         public.local_now()::date + p.scheduled_time,
         public.local_now()::date + p.scheduled_time + interval '2 hours',
         public.local_now()::date + p.scheduled_time + interval '3 hours'
  from public.prescriptions p
  join public.profiles pr on pr.id = p.patient_id and pr.notifications_enabled
  join public.exercises e on e.slug = p.exercise_slug
  where p.active
    and public.local_now() >= public.local_now()::date + p.scheduled_time
    and public.local_now() < public.local_now()::date + p.scheduled_time + interval '15 minutes'
    and (p.created_at at time zone 'Africa/Cairo') <= public.local_now()::date + p.scheduled_time
    and not exists (select 1 from public.reminders_sent r where r.prescription_id = p.id and r.day = public.local_now()::date)
    and not exists (select 1 from public.completions c where c.prescription_id = p.id and c.day = public.local_now()::date)
$$;

revoke execute on function public.due_reminders() from public, anon, authenticated;
grant execute on function public.due_reminders() to service_role;
grant select, insert, delete on public.reminders_sent, public.push_subscriptions to service_role;
