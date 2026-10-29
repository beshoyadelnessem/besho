-- Chat, notifications (push + outbox), session reminders and the daily missed-days check.

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,  -- the conversation
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_patient on public.messages (patient_id, created_at);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Messages waiting to be pushed by the send-reminders function.
create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.reminders_sent (
  prescription_id bigint not null references public.prescriptions (id) on delete cascade,
  day date not null,
  primary key (prescription_id, day)
);

-- ---------------------------------------------------------------- chat
create or replace function public.send_message(p_patient uuid, p_body text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare me public.app_role := public.my_role(); lang text;
begin
  if p_patient = auth.uid() then
    if not (select chat_enabled from public.profiles where id = p_patient) then
      raise exception 'chat is not enabled for you' using errcode = 'P0001';
    end if;
  elsif not public.can_manage_patient(p_patient) then
    raise exception 'not allowed';
  end if;
  insert into public.messages (patient_id, sender_id, body) values (p_patient, auth.uid(), trim(p_body));
  if me in ('admin', 'therapist') then
    select p.lang into lang from public.profiles p where p.id = p_patient;
    if (select notifications_enabled from public.profiles where id = p_patient) then
      insert into public.notification_outbox (patient_id, title, body) values (p_patient,
        case lang when 'ar' then 'رسالة جديدة من الأخصائي' when 'de' then 'Neue Nachricht von Ihrer Therapeutin / Ihrem Therapeuten' else 'New message from your therapist' end,
        left(trim(p_body), 120));
    end if;
  end if;
end $$;

-- marks the other side's messages in this conversation as read
create or replace function public.mark_messages_read(p_patient uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_read_patient(p_patient) then raise exception 'not allowed'; end if;
  update public.messages set read_at = now()
  where patient_id = p_patient and read_at is null
    and (case when auth.uid() = p_patient then sender_id <> p_patient else sender_id = p_patient end);
end $$;

-- ---------------------------------------------------------------- reminders (service role only)
-- Sessions whose window opened in the last 15 minutes, in each clinic's own time zone.
create or replace function public.due_reminders()
returns table (prescription_id bigint, patient_id uuid, day date, lang text, content jsonb,
               opens_at timestamp, late_at timestamp, closes_at timestamp)
language sql stable security definer set search_path = public as $$
  select o.prescription_id, pr.id, (public.patient_now(pr.id))::date, pr.lang, e.content, o.opens_at, o.late_at, o.closes_at
  from public.profiles pr
  cross join lateral public._occurrences(pr.id, public.patient_now(pr.id)::date) o
  join public.prescriptions p on p.id = o.prescription_id
  join public.exercises e on e.slug = p.exercise_slug
  where pr.role = 'patient' and pr.notifications_enabled
    and public.patient_now(pr.id) >= o.opens_at and public.patient_now(pr.id) < o.opens_at + interval '15 minutes'
    and not exists (select 1 from public.reminders_sent r where r.prescription_id = o.prescription_id and r.day = o.opens_at::date)
    and not exists (select 1 from public.completions c where c.prescription_id = o.prescription_id and c.day = o.opens_at::date)
$$;

-- Daily: patients who missed the last two days in a row get an encouraging message,
-- and the event goes into their record for the therapist. Run shortly after midnight.
create or replace function public.daily_checks()
returns int language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0; today date;
begin
  for r in select p.id, p.lang, p.full_name, p.notifications_enabled from public.profiles p
           where p.role = 'patient' and exists (select 1 from public.assignments a where a.patient_id = p.id and a.active)
  loop
    today := public.patient_now(r.id)::date;
    if public._day_status(r.id, today - 1) = 'missed' and public._day_status(r.id, today - 2) = 'missed'
       and not exists (select 1 from public.patient_events e where e.patient_id = r.id and e.kind = 'missed_2_days'
                       and e.data->>'day' = (today - 1)::text) then
      insert into public.patient_events (patient_id, kind, data) values (r.id, 'missed_2_days', jsonb_build_object('day', today - 1));
      if r.notifications_enabled then
        insert into public.notification_outbox (patient_id, title, body) values (r.id,
          case r.lang when 'ar' then 'وحشتنا! 💪' when 'de' then 'Wir vermissen dich! 💪' else 'We miss you! 💪' end,
          case r.lang
            when 'ar' then 'فاتك تمرين يومين. ركبتك محتاجاك النهارده، ابدأ بأول تمرين وهتلاقي نفسك كمّلت.'
            when 'de' then 'Du hast zwei Tage ausgelassen. Dein Knie braucht dich heute – starte mit der ersten Übung.'
            else 'You''ve missed two days. Your knee needs you today – start with the first exercise and keep going.' end);
      end if;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
