-- Patients choose their own name and password at their first sign-in.
-- * The name is their login (besides the phone number), so it is unique among all patients.
--   Spelling variants count as the same name: case, extra spaces, diacritics, أ/إ/آ/ا, ة/ه, ى/ي.
-- * The current password is kept for the patient's current therapist and the clinic admin,
--   so they can tell a patient who forgot it. Nobody else can read it (not the platform owner,
--   not a former therapist, not the patient through the API). Written only by the create-user
--   Edge Function (service role).

-- ---------------------------------------------------------------- name rules
create or replace function public.norm_name(p text) returns text
language sql immutable parallel safe set search_path = public as $$
  select btrim(regexp_replace(
           translate(regexp_replace(lower(coalesce(p, '')), '[ً-ْـ]', '', 'g'), 'أإآةى', 'اااهي'),
           '\s+', ' ', 'g'))
$$;

create unique index if not exists profiles_patient_name_unique
  on public.profiles (public.norm_name(full_name)) where role = 'patient';

-- ---------------------------------------------------------------- stored passwords
create table if not exists public.patient_passwords (
  patient_id uuid primary key references public.profiles (id) on delete cascade,
  password text not null,
  set_by text not null check (set_by in ('patient', 'staff')),
  chosen_by_patient boolean not null default false,   -- stays true once the patient picked one
  updated_at timestamptz not null default now()
);
alter table public.patient_passwords enable row level security;
revoke all on public.patient_passwords from public, anon, authenticated;
grant select on public.patient_passwords to authenticated;
grant all on public.patient_passwords to service_role;
drop policy if exists patient_passwords_read on public.patient_passwords;
create policy patient_passwords_read on public.patient_passwords for select to authenticated
  using (public.can_manage_patient(patient_id));

create or replace function public._store_password(p_patient uuid, p_password text, p_by_patient boolean)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.patient_passwords (patient_id, password, set_by, chosen_by_patient)
  values (p_patient, p_password, case when p_by_patient then 'patient' else 'staff' end, p_by_patient)
  on conflict (patient_id) do update set
    password = excluded.password, set_by = excluded.set_by, updated_at = now(),
    chosen_by_patient = public.patient_passwords.chosen_by_patient or excluded.chosen_by_patient
$$;
revoke execute on function public._store_password(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public._store_password(uuid, text, boolean) to service_role;

-- Used by the profile guard, which runs as the caller; answers only about the caller.
create or replace function public._credentials_chosen(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_patient = auth.uid()
     and coalesce((select chosen_by_patient from public.patient_passwords where patient_id = p_patient), false)
$$;
revoke execute on function public._credentials_chosen(uuid) from public, anon;
grant execute on function public._credentials_chosen(uuid) to authenticated;

-- ---------------------------------------------------------------- sign-in by name or phone
-- Maps what a patient types (their name or phone) to the sign-in address of their account.
-- Returns null when nothing matches. Staff sign in with their e-mail directly.
create or replace function public.login_email(p_login text) returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email::text from public.profiles p join auth.users u on u.id = p.id
  where p.role = 'patient' and (
        (regexp_replace(p_login, '\D', '', 'g') <> '' and p.phone = regexp_replace(p_login, '\D', '', 'g')
         and p_login ~ '^[\s+0-9()-]+$')
     or public.norm_name(p.full_name) = public.norm_name(p_login))
  limit 1
$$;
revoke execute on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;

-- ---------------------------------------------------------------- profile guard
-- Adds to 0001: a patient's name changes only through the create-user function, and a
-- patient finishes the first setup only after choosing their own name and password.
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
    if old.role = 'patient' then
      if new.full_name is distinct from old.full_name then raise exception 'name_locked'; end if;
      if new.onboarded and not old.onboarded and not public._credentials_chosen(new.id) then
        raise exception 'choose_credentials_first';
      end if;
    end if;
  end if;
  return new;
end $$;
