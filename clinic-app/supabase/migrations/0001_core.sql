-- Core: clinics (tenants), people, therapist–patient links, access helpers.
-- Roles: owner (runs the platform, no clinic) · admin / therapist / patient (belong to one clinic).
-- The platform owner manages clinics and their staff but never sees patient health data.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('owner', 'admin', 'therapist', 'patient');
exception when duplicate_object then null; end $$;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  timezone text not null default 'Africa/Cairo',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  clinic_id uuid references public.clinics (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  phone text unique check (phone ~ '^[0-9+]{8,15}$'),
  gender text check (gender in ('male', 'female')),
  birth_year int check (birth_year between 1900 and 2100),
  avatar jsonb not null default '{}'::jsonb,          -- { "hijab": true }
  lang text not null default 'en' check (lang in ('en', 'ar', 'de')),
  large_text boolean not null default false,
  notifications_enabled boolean not null default true,
  chat_enabled boolean not null default false,       -- switched on per patient by their therapist
  treatment_start date,
  onboarded boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((role = 'owner') = (clinic_id is null))
);
create index if not exists profiles_clinic on public.profiles (clinic_id);

create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id) on delete cascade,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists assignments_one_active on public.assignments (patient_id) where active;

-- ---------------------------------------------------------------- time
-- Single source of "now" so tests can freeze the clock.
create or replace function public.utc_now() returns timestamptz language sql stable as $$ select now() $$;

create or replace function public.patient_now(p_patient uuid) returns timestamp
language sql stable security definer set search_path = public as $$
  select public.utc_now() at time zone coalesce(
    (select c.timezone from public.profiles p join public.clinics c on c.id = p.clinic_id where p.id = p_patient),
    'Africa/Cairo')
$$;

-- ---------------------------------------------------------------- who am I
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.my_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select clinic_id from public.profiles where id = auth.uid()
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'owner', false)
$$;
create or replace function public.clinic_of(p_person uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select clinic_id from public.profiles where id = p_person
$$;
-- clinic admin of the clinic this person belongs to
create or replace function public.is_admin_of(p_person uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin' and public.my_clinic() = public.clinic_of(p_person), false)
$$;
-- current = only the active link; otherwise any past link counts (read-only history)
create or replace function public.is_therapist_of(p_patient uuid, p_current_only boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments a
                 where a.patient_id = p_patient and a.therapist_id = auth.uid() and (a.active or not p_current_only))
$$;
create or replace function public.can_read_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_patient = auth.uid() or public.is_admin_of(p_patient) or public.is_therapist_of(p_patient, false)
$$;
create or replace function public.can_manage_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin_of(p_patient) or public.is_therapist_of(p_patient, true)
$$;

-- ---------------------------------------------------------------- profile guard
-- Patients may change their age, language, text size and notifications; their gender and
-- avatar are fixed once onboarding is saved. Only staff switch chat on. Nobody changes
-- role, clinic or identity fields from the browser. Runs as the caller (security invoker).
create or replace function public.profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.role is distinct from old.role or new.id is distinct from old.id or new.clinic_id is distinct from old.clinic_id
     or new.created_by is distinct from old.created_by or new.phone is distinct from old.phone
     or new.treatment_start is distinct from old.treatment_start then
    raise exception 'field is read-only';
  end if;
  if auth.uid() = new.id then
    if new.chat_enabled is distinct from old.chat_enabled then raise exception 'chat is switched on by your therapist'; end if;
    if old.onboarded and (new.gender is distinct from old.gender or new.avatar is distinct from old.avatar) then
      raise exception 'gender and avatar are fixed after the first setup';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();
