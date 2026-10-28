-- Physio home-exercise system: admin, therapists, patients.
-- Times follow the clinic's local time (Africa/Cairo).
-- Exercise windows: 2 h on time + 1 h late grace, then the session closes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- types
do $$ begin
  create type public.app_role as enum ('admin', 'therapist', 'patient');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text unique check (phone ~ '^[0-9+]{8,15}$'),
  gender text check (gender in ('male', 'female')),
  birth_year int check (birth_year between 1900 and 2100),
  avatar jsonb not null default '{}'::jsonb,
  treatment_start date,
  notifications_enabled boolean not null default true,
  onboarded boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id) on delete cascade,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists assignments_one_active
  on public.assignments (patient_id) where active;

create table if not exists public.exercises (
  slug text primary key,
  condition text not null default 'acl',
  phase int not null check (phase between 1 and 3),
  name_ar text not null,
  name_en text not null,
  default_sets int not null,
  default_reps int not null,
  default_hold_sec int not null default 0,
  steps_ar text[] not null,
  tip_ar text,
  caution_ar text not null,
  sort int not null default 0
);

create table if not exists public.prescriptions (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id),
  exercise_slug text not null references public.exercises (slug),
  sets int not null check (sets between 1 and 10),
  reps int not null check (reps between 1 and 100),
  hold_sec int not null default 0 check (hold_sec between 0 and 600),
  scheduled_time time not null,
  extra_caution_ar text check (char_length(extra_caution_ar) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists prescriptions_patient on public.prescriptions (patient_id);

create table if not exists public.completions (
  id bigint generated always as identity primary key,
  prescription_id bigint not null references public.prescriptions (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  completed_at timestamptz not null default now(),
  late boolean not null default false,
  unique (prescription_id, day)
);

create table if not exists public.pain_reports (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  note text check (char_length(note) <= 500),
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (patient_id, day)
);

create table if not exists public.streak_restores (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  cycle int not null,
  created_at timestamptz not null default now(),
  unique (patient_id, day),
  unique (patient_id, cycle)
);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reminders_sent (
  prescription_id bigint not null references public.prescriptions (id) on delete cascade,
  day date not null,
  primary key (prescription_id, day)
);

-- ---------------------------------------------------------------- helpers
create or replace function public.local_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Africa/Cairo') $$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- current = only the active assignment; otherwise any past assignment counts (read access)
create or replace function public.is_therapist_of(p_patient uuid, p_current_only boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.assignments a
    where a.patient_id = p_patient and a.therapist_id = auth.uid()
      and (a.active or not p_current_only))
$$;

create or replace function public.can_read_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_patient = auth.uid() or public.is_admin() or public.is_therapist_of(p_patient, false)
$$;

create or replace function public.can_manage_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_therapist_of(p_patient, true)
$$;

-- ---------------------------------------------------------------- schedule logic
-- One occurrence = one prescription on one day. It counts only if the
-- prescription already existed when that day's window opened.
create or replace function public.occurrences(p_patient uuid, p_day date)
returns table (prescription_id bigint, opens_at timestamp, late_at timestamp, closes_at timestamp)
language sql stable security definer set search_path = public as $$
  select p.id,
         p_day + p.scheduled_time,
         p_day + p.scheduled_time + interval '2 hours',
         p_day + p.scheduled_time + interval '3 hours'
  from public.prescriptions p
  where p.patient_id = p_patient
    and (p.created_at at time zone 'Africa/Cairo') <= p_day + p.scheduled_time
    and (p.ended_at is null or (p.ended_at at time zone 'Africa/Cairo') > p_day + p.scheduled_time)
$$;

-- none | done | rest | restored | pending | missed
create or replace function public.day_status(p_patient uuid, p_day date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  n_total int; n_done int; still_open boolean;
begin
  if not public.can_read_patient(p_patient) then raise exception 'not allowed'; end if;
  if p_day < (select treatment_start from public.profiles where id = p_patient) then return 'none'; end if;
  select count(*), count(c.id), bool_or(o.closes_at > public.local_now() and c.id is null)
    into n_total, n_done, still_open
  from public.occurrences(p_patient, p_day) o
  left join public.completions c on c.prescription_id = o.prescription_id and c.day = p_day;
  if n_total = 0 then return 'none'; end if;
  if exists (select 1 from public.pain_reports where patient_id = p_patient and day = p_day) then return 'rest'; end if;
  if n_done = n_total then return 'done'; end if;
  if still_open then return 'pending'; end if;
  if exists (select 1 from public.streak_restores where patient_id = p_patient and day = p_day) then return 'restored'; end if;
  return 'missed';
end $$;

create or replace function public.day_statuses(p_patient uuid, p_from date, p_to date)
returns table (day date, status text) language sql stable security definer set search_path = public as $$
  select d::date, public.day_status(p_patient, d::date)
  from generate_series(p_from, p_to, interval '1 day') d
$$;

-- Streak: consecutive "done" days back from today. rest / restored / none days
-- keep the streak without adding to it; today counts only once finished.
create or replace function public.streak_info(p_patient uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := public.local_now()::date;
  d date := today;
  st text;
  streak int := 0;
  start_day date;
  cyc int;
  last_missed date;
  used boolean;
begin
  if not public.can_read_patient(p_patient) then raise exception 'not allowed'; end if;
  select coalesce(treatment_start, created_at::date) into start_day from public.profiles where id = p_patient;
  loop
    exit when d < start_day or d < today - 400;
    st := public.day_status(p_patient, d);
    if st = 'missed' then
      last_missed := coalesce(last_missed, d);
      exit;
    elsif st = 'done' then streak := streak + 1;
    end if;
    d := d - 1;
  end loop;
  cyc := greatest(0, (today - start_day) / 7);
  used := exists (select 1 from public.streak_restores where patient_id = p_patient and cycle = cyc);
  return jsonb_build_object(
    'streak', streak,
    'cycle', cyc,
    'cycle_ends', start_day + (cyc + 1) * 7,
    'restore_used_this_week', used,
    -- a missed day can be restored until the end of the following day
    'restorable_day', case when last_missed is not null and last_missed >= today - 1 and not used then last_missed end
  );
end $$;

-- What the patient sees today, with each session's window state.
create or replace function public.today_plan()
returns table (prescription_id bigint, exercise_slug text, sets int, reps int, hold_sec int,
               extra_caution_ar text, opens_at timestamp, late_at timestamp, closes_at timestamp,
               state text, completed_at timestamptz, late boolean)
language sql stable security definer set search_path = public as $$
  with o as (select * from public.occurrences(auth.uid(), public.local_now()::date))
  select p.id, p.exercise_slug, p.sets, p.reps, p.hold_sec, p.extra_caution_ar,
         o.opens_at, o.late_at, o.closes_at,
         case when c.id is not null then 'done'
              when public.local_now() < o.opens_at then 'upcoming'
              when public.local_now() < o.late_at then 'open'
              when public.local_now() < o.closes_at then 'late'
              else 'closed' end,
         c.completed_at, coalesce(c.late, false)
  from o join public.prescriptions p on p.id = o.prescription_id
  left join public.completions c on c.prescription_id = p.id and c.day = o.opens_at::date
  order by o.opens_at, p.id
$$;

-- ---------------------------------------------------------------- patient actions
create or replace function public.complete_exercise(p_prescription bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  now_l timestamp := public.local_now();
  occ record;
begin
  if public.my_role() is distinct from 'patient' then raise exception 'only patients complete exercises'; end if;
  -- today's window, or yesterday's if it runs past midnight
  select o.* into occ
  from (select * from public.occurrences(auth.uid(), now_l::date)
        union all select * from public.occurrences(auth.uid(), now_l::date - 1)) o
  where o.prescription_id = p_prescription and now_l >= o.opens_at and now_l < o.closes_at
  limit 1;
  if occ is null then raise exception 'outside the allowed time window' using errcode = 'P0001'; end if;
  insert into public.completions (prescription_id, patient_id, day, late)
  values (p_prescription, auth.uid(), occ.opens_at::date, now_l >= occ.late_at)
  on conflict (prescription_id, day) do nothing;
  return jsonb_build_object('late', now_l >= occ.late_at);
end $$;

create or replace function public.report_pain(p_note text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'patient' then raise exception 'only patients report pain'; end if;
  insert into public.pain_reports (patient_id, day, note)
  values (auth.uid(), public.local_now()::date, nullif(trim(p_note), ''))
  on conflict (patient_id, day) do update set note = excluded.note, seen = false;
end $$;

create or replace function public.restore_streak()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare info jsonb;
begin
  if public.my_role() is distinct from 'patient' then raise exception 'only patients restore'; end if;
  info := public.streak_info(auth.uid());
  if info->>'restorable_day' is null then raise exception 'nothing to restore' using errcode = 'P0001'; end if;
  insert into public.streak_restores (patient_id, day, cycle)
  values (auth.uid(), (info->>'restorable_day')::date, (info->>'cycle')::int);
  return public.streak_info(auth.uid());
end $$;

-- ---------------------------------------------------------------- staff actions
create or replace function public.transfer_patient(p_patient uuid, p_therapist uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if not exists (select 1 from public.profiles where id = p_therapist and role in ('therapist', 'admin')) then
    raise exception 'not a therapist'; end if;
  update public.assignments set active = false, ended_at = now() where patient_id = p_patient and active;
  insert into public.assignments (patient_id, therapist_id) values (p_patient, p_therapist);
end $$;

create or replace function public.set_treatment_start(p_patient uuid, p_day date)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_manage_patient(p_patient) then raise exception 'not allowed'; end if;
  update public.profiles set treatment_start = p_day where id = p_patient and role = 'patient';
end $$;

-- Stop direct role/ownership changes even if a column grant is widened later.
-- security invoker on purpose: current_user must be the caller's role
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.role is distinct from old.role or new.id is distinct from old.id
       or new.treatment_start is distinct from old.treatment_start
       or new.created_by is distinct from old.created_by or new.phone is distinct from old.phone) then
    raise exception 'field is read-only';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.assignments enable row level security;
alter table public.exercises enable row level security;
alter table public.prescriptions enable row level security;
alter table public.completions enable row level security;
alter table public.pain_reports enable row level security;
alter table public.streak_restores enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminders_sent enable row level security;

revoke all on all tables in schema public from anon, authenticated;
-- Supabase grants every new function to anon/authenticated by default; take that back
-- and grant only the entry points below. Internal helpers stay owner-only.
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, gender, birth_year, avatar, notifications_enabled, onboarded) on public.profiles to authenticated;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin()
  or (role = 'patient' and public.is_therapist_of(id, false))
  or (role in ('therapist', 'admin') and public.my_role() in ('therapist', 'admin')));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_manage_patient(id))
  with check (id = auth.uid() or public.can_manage_patient(id));

grant select on public.assignments to authenticated;
drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated using (
  patient_id = auth.uid() or therapist_id = auth.uid() or public.is_admin());

grant select on public.exercises to authenticated;
drop policy if exists exercises_read on public.exercises;
create policy exercises_read on public.exercises for select to authenticated using (true);

grant select on public.prescriptions to authenticated;
grant insert (patient_id, therapist_id, exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution_ar) on public.prescriptions to authenticated;
grant update (sets, reps, hold_sec, scheduled_time, extra_caution_ar, active, ended_at) on public.prescriptions to authenticated;
drop policy if exists prescriptions_read on public.prescriptions;
create policy prescriptions_read on public.prescriptions for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists prescriptions_write on public.prescriptions;
create policy prescriptions_write on public.prescriptions for insert to authenticated
  with check (therapist_id = auth.uid() and public.can_manage_patient(patient_id));
drop policy if exists prescriptions_update on public.prescriptions;
create policy prescriptions_update on public.prescriptions for update to authenticated
  using (public.can_manage_patient(patient_id)) with check (public.can_manage_patient(patient_id));

grant select on public.completions, public.streak_restores to authenticated;
drop policy if exists completions_read on public.completions;
create policy completions_read on public.completions for select to authenticated using (public.can_read_patient(patient_id));
drop policy if exists restores_read on public.streak_restores;
create policy restores_read on public.streak_restores for select to authenticated using (public.can_read_patient(patient_id));

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

grant execute on function public.today_plan(), public.complete_exercise(bigint), public.report_pain(text),
  public.restore_streak(), public.streak_info(uuid), public.day_statuses(uuid, date, date), public.day_status(uuid, date),
  public.transfer_patient(uuid, uuid), public.set_treatment_start(uuid, date), public.my_role(),
  public.is_admin(), public.is_therapist_of(uuid, boolean), public.can_read_patient(uuid),
  public.can_manage_patient(uuid), public.local_now() to authenticated;
