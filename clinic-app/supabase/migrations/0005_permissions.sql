-- Row level security and grants for everything above. Kept in one file so the whole
-- access model can be reviewed in one place. Run this after 0001–0004 (and again after
-- adding objects): it first revokes everything, then grants only what the app uses.

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.assignments enable row level security;
alter table public.exercises enable row level security;
alter table public.prescriptions enable row level security;
alter table public.completions enable row level security;
alter table public.pain_reports enable row level security;
alter table public.pain_scores enable row level security;
alter table public.streak_restores enable row level security;
alter table public.badges enable row level security;
alter table public.patient_events enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.reminders_sent enable row level security;
alter table public.program_templates enable row level security;
alter table public.template_items enable row level security;
alter table public.appointments enable row level security;

-- Supabase grants every new table and function to anon/authenticated by default; take it all back.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

-- helper used inside policies
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'therapist'), false)
$$;
revoke execute on function public.is_staff() from public, anon;

-- ---------------------------------------------------------------- clinics
grant select on public.clinics to authenticated;
grant update (name) on public.clinics to authenticated;
drop policy if exists clinics_read on public.clinics;
create policy clinics_read on public.clinics for select to authenticated using (public.is_owner() or id = public.my_clinic());
drop policy if exists clinics_rename on public.clinics;
create policy clinics_rename on public.clinics for update to authenticated
  using (id = public.my_clinic() and public.my_role() = 'admin') with check (id = public.my_clinic());

-- ---------------------------------------------------------------- profiles
grant select on public.profiles to authenticated;
grant update (full_name, gender, birth_year, avatar, lang, large_text, notifications_enabled, onboarded) on public.profiles to authenticated;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or (public.is_owner() and role <> 'patient')
  or (public.my_role() = 'admin' and clinic_id = public.my_clinic())
  or (public.my_role() = 'therapist' and (
        (role = 'patient' and public.is_therapist_of(id, false))
        or (role in ('admin', 'therapist') and clinic_id = public.my_clinic())))
  or (public.my_role() = 'patient' and role in ('admin', 'therapist') and exists (
        select 1 from public.assignments a where a.patient_id = auth.uid() and a.therapist_id = profiles.id)));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_manage_patient(id)) with check (id = auth.uid() or public.can_manage_patient(id));

grant select on public.assignments to authenticated;
drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated using (
  patient_id = auth.uid() or therapist_id = auth.uid() or public.is_admin_of(patient_id));

-- ---------------------------------------------------------------- program
grant select on public.exercises to authenticated;
drop policy if exists exercises_read on public.exercises;
create policy exercises_read on public.exercises for select to authenticated using (clinic_id is null or clinic_id = public.my_clinic());

grant select on public.prescriptions to authenticated;
grant insert (patient_id, therapist_id, exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution) on public.prescriptions to authenticated;
grant update (sets, reps, hold_sec, scheduled_time, extra_caution, active, ended_at) on public.prescriptions to authenticated;
drop policy if exists prescriptions_read on public.prescriptions;
create policy prescriptions_read on public.prescriptions for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists prescriptions_insert on public.prescriptions;
create policy prescriptions_insert on public.prescriptions for insert to authenticated
  with check (therapist_id = auth.uid() and public.can_manage_patient(patient_id));
drop policy if exists prescriptions_update on public.prescriptions;
create policy prescriptions_update on public.prescriptions for update to authenticated
  using (public.can_manage_patient(patient_id)) with check (public.can_manage_patient(patient_id));

grant select on public.completions, public.streak_restores, public.badges, public.pain_scores, public.patient_events, public.messages to authenticated;
drop policy if exists completions_read on public.completions;
create policy completions_read on public.completions for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists restores_read on public.streak_restores;
create policy restores_read on public.streak_restores for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists scores_read on public.pain_scores;
create policy scores_read on public.pain_scores for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists events_read on public.patient_events;
create policy events_read on public.patient_events for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated using (public.can_read_patient(patient_id));

grant select on public.pain_reports to authenticated;
grant update (seen) on public.pain_reports to authenticated;
drop policy if exists pain_read on public.pain_reports;
create policy pain_read on public.pain_reports for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists pain_seen on public.pain_reports;
create policy pain_seen on public.pain_reports for update to authenticated
  using (public.can_manage_patient(patient_id)) with check (public.can_manage_patient(patient_id));

grant select, insert, delete on public.push_subscriptions to authenticated;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());

-- ---------------------------------------------------------------- clinic tools
grant select, delete on public.program_templates to authenticated;
grant update (name) on public.program_templates to authenticated;
drop policy if exists templates_staff on public.program_templates;
create policy templates_staff on public.program_templates for all to authenticated
  using (clinic_id = public.my_clinic() and public.is_staff()) with check (clinic_id = public.my_clinic() and public.is_staff());
grant select on public.template_items to authenticated;
drop policy if exists template_items_staff on public.template_items;
create policy template_items_staff on public.template_items for select to authenticated using (
  exists (select 1 from public.program_templates t where t.id = template_id and t.clinic_id = public.my_clinic() and public.is_staff()));

grant select on public.appointments to authenticated;
grant insert (clinic_id, patient_id, therapist_id, starts_at, duration_min, note, created_by) on public.appointments to authenticated;
grant update (starts_at, duration_min, status, note) on public.appointments to authenticated;
drop policy if exists appointments_read on public.appointments;
create policy appointments_read on public.appointments for select to authenticated using (
  patient_id = auth.uid() or (clinic_id = public.my_clinic() and public.is_staff()));
drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments for insert to authenticated with check (
  clinic_id = public.my_clinic() and public.can_manage_patient(patient_id)
  and public.clinic_of(therapist_id) = public.my_clinic() and created_by = auth.uid());
drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update to authenticated
  using (clinic_id = public.my_clinic() and public.can_manage_patient(patient_id))
  with check (clinic_id = public.my_clinic());

-- ---------------------------------------------------------------- functions
grant execute on function
  public.today_plan(), public.complete_exercise(bigint), public.report_pain(text), public.log_pain_score(int),
  public.restore_streak(), public.streak_info(uuid), public.day_statuses(uuid, date, date),
  public.transfer_patient(uuid, uuid), public.set_treatment_start(uuid, date), public.set_chat(uuid, boolean),
  public.send_message(uuid, text), public.mark_messages_read(uuid),
  public.save_template_from_patient(uuid, text), public.apply_template(uuid, bigint),
  -- used inside policies
  public.my_role(), public.my_clinic(), public.is_owner(), public.is_staff(), public.clinic_of(uuid), public.is_admin_of(uuid),
  public.is_therapist_of(uuid, boolean), public.can_read_patient(uuid), public.can_manage_patient(uuid)
to authenticated;

-- server-side jobs (Edge Functions with the service role, pg_cron)
grant execute on function public.due_reminders(), public.daily_checks() to service_role;
grant select, insert, update, delete on public.notification_outbox, public.reminders_sent, public.push_subscriptions to service_role;
