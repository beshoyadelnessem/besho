-- Ready-made programs (templates) and clinic appointments.

create table if not exists public.program_templates (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.template_items (
  id bigint generated always as identity primary key,
  template_id bigint not null references public.program_templates (id) on delete cascade,
  exercise_slug text not null references public.exercises (slug),
  sets int not null check (sets between 1 and 10),
  reps int not null check (reps between 1 and 100),
  hold_sec int not null default 0 check (hold_sec between 0 and 600),
  scheduled_time time not null,
  extra_caution text check (char_length(extra_caution) <= 300)
);

create table if not exists public.appointments (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  duration_min int not null default 45 check (duration_min between 10 and 240),
  status text not null default 'booked' check (status in ('booked', 'done', 'cancelled', 'no_show')),
  note text check (char_length(note) <= 300),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists appointments_clinic_time on public.appointments (clinic_id, starts_at);

-- Save a patient's current active program as a template for the clinic.
create or replace function public.save_template_from_patient(p_patient uuid, p_name text)
returns bigint language plpgsql volatile security definer set search_path = public as $$
declare t bigint;
begin
  if not public.can_manage_patient(p_patient) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.prescriptions where patient_id = p_patient and active) then
    raise exception 'the patient has no active exercises' using errcode = 'P0001';
  end if;
  insert into public.program_templates (clinic_id, name, created_by) values (public.clinic_of(p_patient), trim(p_name), auth.uid())
  returning id into t;
  insert into public.template_items (template_id, exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution)
  select t, exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution
  from public.prescriptions where patient_id = p_patient and active;
  return t;
end $$;

-- Add every exercise of a template to a patient (as the calling therapist's prescriptions).
create or replace function public.apply_template(p_patient uuid, p_template bigint)
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public.can_manage_patient(p_patient) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.program_templates where id = p_template and clinic_id = public.clinic_of(p_patient)) then
    raise exception 'template not found';
  end if;
  insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution)
  select p_patient, auth.uid(), exercise_slug, sets, reps, hold_sec, scheduled_time, extra_caution
  from public.template_items where template_id = p_template;
  get diagnostics n = row_count;
  return n;
end $$;
