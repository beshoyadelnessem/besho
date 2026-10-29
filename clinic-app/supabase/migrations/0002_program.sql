-- Exercise library, prescriptions, time windows, streak, restore, pain, badges, patient record.
-- Each session opens at the scheduled time for 2 h, then a 1 h late grace, then closes.

create table if not exists public.exercises (
  slug text primary key,
  clinic_id uuid references public.clinics (id) on delete cascade,  -- null = shared library
  condition text not null default 'acl',
  phase int not null check (phase between 1 and 3),
  sort int not null default 0,
  default_sets int not null,
  default_reps int not null,
  default_hold_sec int not null default 0,
  -- { "en": { "name", "steps": [], "tip", "caution" }, "ar": {...}, "de": {...} }
  content jsonb not null
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
  extra_caution text check (char_length(extra_caution) <= 300),
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

-- "I have pain / can't train today": a rest day that keeps the streak
create table if not exists public.pain_reports (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  note text check (char_length(note) <= 500),
  seen boolean not null default false,
  created_at timestamptz not null default now(),
  unique (patient_id, day)
);

-- daily 0–10 pain score
create table if not exists public.pain_scores (
  patient_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  score int not null check (score between 0 and 10),
  created_at timestamptz not null default now(),
  primary key (patient_id, day)
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

create table if not exists public.badges (
  patient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('streak3', 'streak7', 'streak14', 'streak30')),
  earned_at timestamptz not null default now(),
  primary key (patient_id, kind)
);

-- Everything notable about a patient, shown as a timeline in their record.
create table if not exists public.patient_events (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,       -- missed_2_days | badge | restore | pain_report | transfer | chat_on | chat_off
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists patient_events_patient on public.patient_events (patient_id, created_at desc);

-- ---------------------------------------------------------------- schedule (internal, no auth checks)
create or replace function public._occurrences(p_patient uuid, p_day date)
returns table (prescription_id bigint, opens_at timestamp, late_at timestamp, closes_at timestamp)
language sql stable security definer set search_path = public as $$
  select p.id, p_day + p.scheduled_time, p_day + p.scheduled_time + interval '2 hours', p_day + p.scheduled_time + interval '3 hours'
  from public.prescriptions p
  join public.profiles pr on pr.id = p.patient_id
  join public.clinics c on c.id = pr.clinic_id
  where p.patient_id = p_patient
    and (p.created_at at time zone c.timezone) <= p_day + p.scheduled_time
    and (p.ended_at is null or (p.ended_at at time zone c.timezone) > p_day + p.scheduled_time)
$$;

-- none | done | rest | restored | pending | missed
create or replace function public._day_status(p_patient uuid, p_day date)
returns text language plpgsql stable security definer set search_path = public as $$
declare n_total int; n_done int; still_open boolean; now_l timestamp := public.patient_now(p_patient);
begin
  if p_day < (select treatment_start from public.profiles where id = p_patient) then return 'none'; end if;
  select count(*), count(c.id), bool_or(o.closes_at > now_l and c.id is null) into n_total, n_done, still_open
  from public._occurrences(p_patient, p_day) o
  left join public.completions c on c.prescription_id = o.prescription_id and c.day = p_day;
  if n_total = 0 then return 'none'; end if;
  if exists (select 1 from public.pain_reports where patient_id = p_patient and day = p_day) then return 'rest'; end if;
  if n_done = n_total then return 'done'; end if;
  if still_open then return 'pending'; end if;
  if exists (select 1 from public.streak_restores where patient_id = p_patient and day = p_day) then return 'restored'; end if;
  return 'missed';
end $$;

-- Streak = consecutive "done" days back from today; rest / restored / none keep it without adding.
-- A missed day can be restored until the end of the following day, once per 7-day cycle
-- counted from the treatment start.
create or replace function public._streak_info(p_patient uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  today date := public.patient_now(p_patient)::date; d date := today; st text; streak int := 0;
  start_day date; cyc int; last_missed date; used boolean;
begin
  select coalesce(treatment_start, created_at::date) into start_day from public.profiles where id = p_patient;
  loop
    exit when d < start_day or d < today - 400;
    st := public._day_status(p_patient, d);
    if st = 'missed' then last_missed := d; exit;
    elsif st = 'done' then streak := streak + 1;
    end if;
    d := d - 1;
  end loop;
  cyc := greatest(0, (today - start_day) / 7);
  used := exists (select 1 from public.streak_restores where patient_id = p_patient and cycle = cyc);
  return jsonb_build_object('streak', streak, 'cycle', cyc, 'cycle_ends', start_day + (cyc + 1) * 7,
    'restore_used_this_week', used,
    'restorable_day', case when last_missed >= today - 1 and not used then last_missed end);
end $$;

create or replace function public._award_badges(p_patient uuid) returns text[]
language plpgsql volatile security definer set search_path = public as $$
declare s int := (public._streak_info(p_patient)->>'streak')::int; k text; won text[] := '{}';
begin
  foreach k in array array['streak3', 'streak7', 'streak14', 'streak30'] loop
    if s >= substr(k, 7)::int then
      insert into public.badges (patient_id, kind) values (p_patient, k) on conflict do nothing;
      if found then
        won := won || k;
        insert into public.patient_events (patient_id, kind, data) values (p_patient, 'badge', jsonb_build_object('badge', k));
      end if;
    end if;
  end loop;
  return won;
end $$;

-- ---------------------------------------------------------------- read endpoints (checked)
create or replace function public.day_statuses(p_patient uuid, p_from date, p_to date)
returns table (day date, status text) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_read_patient(p_patient) then raise exception 'not allowed'; end if;
  if p_to - p_from > 120 then raise exception 'range too long'; end if;
  return query select d::date, public._day_status(p_patient, d::date) from generate_series(p_from, p_to, interval '1 day') d;
end $$;

create or replace function public.streak_info(p_patient uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_read_patient(p_patient) then raise exception 'not allowed'; end if;
  return public._streak_info(p_patient);
end $$;

-- Today's sessions for the signed-in patient, with each window's state.
create or replace function public.today_plan()
returns table (prescription_id bigint, exercise_slug text, sets int, reps int, hold_sec int, extra_caution text,
               opens_at timestamp, late_at timestamp, closes_at timestamp, state text, late boolean)
language sql stable security definer set search_path = public as $$
  with n as (select public.patient_now(auth.uid()) as now_l),
       o as (select * from public._occurrences(auth.uid(), (select now_l::date from n)))
  select p.id, p.exercise_slug, p.sets, p.reps, p.hold_sec, p.extra_caution, o.opens_at, o.late_at, o.closes_at,
         case when c.id is not null then 'done'
              when n.now_l < o.opens_at then 'upcoming'
              when n.now_l < o.late_at then 'open'
              when n.now_l < o.closes_at then 'late'
              else 'closed' end,
         coalesce(c.late, false)
  from o cross join n
  join public.prescriptions p on p.id = o.prescription_id
  left join public.completions c on c.prescription_id = p.id and c.day = o.opens_at::date
  order by o.opens_at, p.id
$$;

-- ---------------------------------------------------------------- patient actions
create or replace function public.complete_exercise(p_prescription bigint)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare now_l timestamp; occ record;
begin
  if public.my_role() is distinct from 'patient' then raise exception 'only patients complete exercises'; end if;
  now_l := public.patient_now(auth.uid());
  select o.* into occ
  from (select * from public._occurrences(auth.uid(), now_l::date)
        union all select * from public._occurrences(auth.uid(), now_l::date - 1)) o   -- windows past midnight
  where o.prescription_id = p_prescription and now_l >= o.opens_at and now_l < o.closes_at
  limit 1;
  if occ is null then raise exception 'outside the allowed time window' using errcode = 'P0001'; end if;
  insert into public.completions (prescription_id, patient_id, day, late)
  values (p_prescription, auth.uid(), occ.opens_at::date, now_l >= occ.late_at)
  on conflict (prescription_id, day) do nothing;
  return jsonb_build_object('late', now_l >= occ.late_at, 'new_badges', to_jsonb(public._award_badges(auth.uid())));
end $$;

create or replace function public.report_pain(p_note text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare d date;
begin
  if public.my_role() is distinct from 'patient' then raise exception 'only patients report pain'; end if;
  d := public.patient_now(auth.uid())::date;
  insert into public.pain_reports (patient_id, day, note) values (auth.uid(), d, nullif(trim(p_note), ''))
  on conflict (patient_id, day) do update set note = excluded.note, seen = false;
  insert into public.patient_events (patient_id, kind, data) values (auth.uid(), 'pain_report', jsonb_build_object('day', d));
end $$;

create or replace function public.log_pain_score(p_score int)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'patient' then raise exception 'only patients log pain'; end if;
  insert into public.pain_scores (patient_id, day, score) values (auth.uid(), public.patient_now(auth.uid())::date, p_score)
  on conflict (patient_id, day) do update set score = excluded.score, created_at = now();
end $$;

create or replace function public.restore_streak()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare info jsonb;
begin
  if public.my_role() is distinct from 'patient' then raise exception 'only patients restore'; end if;
  info := public._streak_info(auth.uid());
  if info->>'restorable_day' is null then raise exception 'nothing to restore' using errcode = 'P0001'; end if;
  insert into public.streak_restores (patient_id, day, cycle)
  values (auth.uid(), (info->>'restorable_day')::date, (info->>'cycle')::int);
  insert into public.patient_events (patient_id, kind, data) values (auth.uid(), 'restore', jsonb_build_object('day', info->>'restorable_day'));
  return public._streak_info(auth.uid());
end $$;

-- ---------------------------------------------------------------- staff actions
create or replace function public.transfer_patient(p_patient uuid, p_therapist uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin_of(p_patient) then raise exception 'clinic admins only'; end if;
  if not exists (select 1 from public.profiles where id = p_therapist and role in ('therapist', 'admin')
                 and clinic_id = public.clinic_of(p_patient)) then
    raise exception 'not a therapist of this clinic';
  end if;
  update public.assignments set active = false, ended_at = now() where patient_id = p_patient and active;
  insert into public.assignments (patient_id, therapist_id) values (p_patient, p_therapist);
  insert into public.patient_events (patient_id, kind, data) values (p_patient, 'transfer', jsonb_build_object('to', p_therapist));
end $$;

create or replace function public.set_treatment_start(p_patient uuid, p_day date)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_manage_patient(p_patient) then raise exception 'not allowed'; end if;
  update public.profiles set treatment_start = p_day where id = p_patient and role = 'patient';
end $$;

create or replace function public.set_chat(p_patient uuid, p_on boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_manage_patient(p_patient) then raise exception 'not allowed'; end if;
  update public.profiles set chat_enabled = p_on where id = p_patient and role = 'patient';
  insert into public.patient_events (patient_id, kind) values (p_patient, case when p_on then 'chat_on' else 'chat_off' end);
end $$;
