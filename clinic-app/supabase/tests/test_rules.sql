-- Access rules and business logic, on a scratch database after the shim and all migrations:
--   psql -v ON_ERROR_STOP=1 -f supabase_shim.sql $(for f in ../migrations/*.sql; do echo -f $f; done) -f test_rules.sql
\set ON_ERROR_STOP 1
\set QUIET 1

-- Freeze the clock: 2026-03-10 08:00 UTC = 10:00 in Cairo, 09:00 in Berlin.
create or replace function public.utc_now() returns timestamptz language sql stable as $$ select timestamptz '2026-03-10 08:00:00+00' $$;

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
-- run a statement that must fail with the given SQLSTATE class
create function pg_temp.refused(stmt text, what text, code text default '42501') returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if sqlstate = code or (code = 'any') then raise notice 'ok - %', what; return; end if;
    raise exception 'FAILED: % (got % %)', what, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % (statement succeeded)', what;
end $$;
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

-- ---------------------------------------------------------------- fixtures
insert into public.clinics (id, name, timezone) values
 ('00000000-0000-0000-0000-0000000000c1', 'Cairo Physio', 'Africa/Cairo'),
 ('00000000-0000-0000-0000-0000000000c2', 'Berlin Physio', 'Europe/Berlin');
insert into auth.users (id) select ('00000000-0000-0000-0000-0000000000' || x)::uuid
from unnest(array['01','a1','a2','b1','b2','b3','d1','d2','d3','d4']) x;
-- 01 owner · a1 admin C1 · a2 admin C2 · b1/b2 therapists C1 · b3 therapist C2 · d1..d3 patients C1 · d4 patient C2
insert into public.profiles (id, role, clinic_id, full_name, phone, treatment_start, onboarded) values
 ('00000000-0000-0000-0000-000000000001', 'owner', null, 'Owner', null, null, true),
 ('00000000-0000-0000-0000-0000000000a1', 'admin', '00000000-0000-0000-0000-0000000000c1', 'Admin Cairo', null, null, true),
 ('00000000-0000-0000-0000-0000000000a2', 'admin', '00000000-0000-0000-0000-0000000000c2', 'Admin Berlin', null, null, true),
 ('00000000-0000-0000-0000-0000000000b1', 'therapist', '00000000-0000-0000-0000-0000000000c1', 'Therapist One', null, null, true),
 ('00000000-0000-0000-0000-0000000000b2', 'therapist', '00000000-0000-0000-0000-0000000000c1', 'Therapist Two', null, null, true),
 ('00000000-0000-0000-0000-0000000000b3', 'therapist', '00000000-0000-0000-0000-0000000000c2', 'Therapist Berlin', null, null, true),
 ('00000000-0000-0000-0000-0000000000d1', 'patient', '00000000-0000-0000-0000-0000000000c1', 'Patient One', '01000000001', '2026-03-01', false),
 ('00000000-0000-0000-0000-0000000000d2', 'patient', '00000000-0000-0000-0000-0000000000c1', 'Patient Two', '01000000002', '2026-03-01', true),
 ('00000000-0000-0000-0000-0000000000d3', 'patient', '00000000-0000-0000-0000-0000000000c1', 'Patient Three', '01000000003', '2026-03-01', true),
 ('00000000-0000-0000-0000-0000000000d4', 'patient', '00000000-0000-0000-0000-0000000000c2', 'Patient Berlin', '01000000004', '2026-03-01', true);
insert into public.assignments (patient_id, therapist_id) values
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2'),
 ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1'),
 ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b3');
insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time, created_at) values
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'slr', 3, 10, '09:30', '2026-03-01'),     -- 1 open
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'quadset', 3, 10, '07:30', '2026-03-01'), -- 2 late
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'pumps', 1, 20, '06:00', '2026-03-01'),   -- 3 closed
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'bridge', 3, 10, '12:00', '2026-03-01'),  -- 4 upcoming
 ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', 'slr', 3, 10, '09:55', '2026-03-01'),     -- 5 due reminder
 ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1', 'slr', 3, 10, '08:00', '2026-03-01'),     -- 6 late window
 ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b3', 'slr', 3, 10, '08:30', '2026-03-01');     -- 7 Berlin
update public.profiles set notifications_enabled = true;
-- p3 did 03-05..03-08 and missed 03-09 (restorable); p2 did nothing
insert into public.completions (prescription_id, patient_id, day)
select 6, '00000000-0000-0000-0000-0000000000d3', d::date from generate_series('2026-03-05'::date, '2026-03-08', '1 day') d;

-- ================================================================ patient p1 (first visit)
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((select count(*) from public.profiles) = 2, 'patient sees own profile + own therapist only');
select pg_temp.expect((select count(*) from public.prescriptions) = 4, 'patient sees only own prescriptions');
select pg_temp.expect((select string_agg(state, ',' order by prescription_id) from public.today_plan()) = 'open,late,closed,upcoming',
  'today_plan window states (Cairo time)');
select pg_temp.expect((public.complete_exercise(1)->>'late')::boolean = false, 'complete on time');
select pg_temp.expect((public.complete_exercise(2)->>'late')::boolean = true, 'complete in grace hour is marked late');
select pg_temp.refused('select public.complete_exercise(3)', 'closed session is refused', 'P0001');
select pg_temp.refused('select public.complete_exercise(4)', 'upcoming session is refused', 'P0001');
select pg_temp.refused('select public.complete_exercise(5)', 'cannot complete another patient''s prescription', 'P0001');
select pg_temp.refused($$insert into public.completions (prescription_id, patient_id, day) values (3, auth.uid(), '2026-03-10')$$,
  'patient cannot insert completions directly');
select pg_temp.refused($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'patient cannot change own role');
update public.profiles set gender = 'female', birth_year = 1990, avatar = '{"hijab":true}', lang = 'ar', onboarded = true where id = auth.uid();
select pg_temp.expect((select onboarded and lang = 'ar' from public.profiles where id = auth.uid()), 'patient saves first setup (gender, age, avatar, language)');
update public.profiles set birth_year = 1985, large_text = true where id = auth.uid();
select pg_temp.expect((select birth_year = 1985 and large_text from public.profiles where id = auth.uid()), 'patient can change age and text size later');
select pg_temp.refused($$update public.profiles set gender = 'male' where id = auth.uid()$$, 'gender is fixed after setup', 'P0001');
select pg_temp.refused($$update public.profiles set avatar = '{}' where id = auth.uid()$$, 'avatar is fixed after setup', 'P0001');
select pg_temp.refused($$update public.profiles set chat_enabled = true where id = auth.uid()$$, 'patient cannot switch chat on', '42501');
select pg_temp.refused($$select public._day_status(auth.uid(), '2026-03-10')$$, 'internal schedule helpers are not callable');
select pg_temp.refused($$select public.daily_checks()$$, 'daily job is not callable by users');
select pg_temp.refused($$select * from public.due_reminders()$$, 'reminder query is not callable by users');
select pg_temp.expect((select status from public.day_statuses(auth.uid(), '2026-03-10', '2026-03-10')) = 'pending', 'today pending while a session is upcoming');
select public.log_pain_score(4);
select public.log_pain_score(3);
select pg_temp.expect((select score from public.pain_scores where patient_id = auth.uid()) = 3, 'daily pain score is stored once per day (last value wins)');
select pg_temp.refused('select public.log_pain_score(11)', 'pain score must be 0–10', '23514');
select public.report_pain('الركبة وارمة');
select pg_temp.expect((select status from public.day_statuses(auth.uid(), '2026-03-10', '2026-03-10')) = 'rest', 'pain report makes today a rest day');
select pg_temp.refused($$select public.streak_info('00000000-0000-0000-0000-0000000000d2')$$, 'cannot read another patient''s streak', 'P0001');
select pg_temp.refused($$select public.send_message(auth.uid(), 'hello')$$, 'chat is closed until the therapist opens it', 'P0001');

-- ================================================================ patient p3: streak, restore, badges
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.expect((public.streak_info(auth.uid())->>'streak')::int = 0, 'missing yesterday breaks the streak');
select pg_temp.expect(public.streak_info(auth.uid())->>'restorable_day' = '2026-03-09', 'yesterday can be restored');
select pg_temp.expect((public.restore_streak()->>'streak')::int = 4, 'restore brings the streak back (restored day adds nothing)');
select pg_temp.refused('select public.restore_streak()', 'second restore in the same week is refused', 'P0001');
select pg_temp.expect((select public.complete_exercise(6)->'new_badges') = '["streak3"]'::jsonb, 'finishing today makes 5 days and earns the 3-day badge');
select pg_temp.expect((select count(*) from public.badges) = 1 and (select count(*) from public.patient_events where kind in ('badge','restore')) = 2,
  'badge and restore are written to the patient record');

-- ================================================================ therapists
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select count(*) from public.profiles where role = 'patient') = 2, 't1 sees only own patients');
select pg_temp.expect((select count(*) from public.profiles where role = 'patient' and clinic_id = '00000000-0000-0000-0000-0000000000c2') = 0, 't1 sees nothing from the other clinic');
insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time, extra_caution)
values ('00000000-0000-0000-0000-0000000000d1', auth.uid(), 'heelslide', 3, 15, '18:00', 'لحد 90 درجة بس');
select pg_temp.expect(true, 't1 prescribes for own patient');
select pg_temp.refused($$insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time)
  values ('00000000-0000-0000-0000-0000000000d2', auth.uid(), 'slr', 3, 10, '18:00')$$, 't1 cannot prescribe for t2''s patient');
update public.pain_reports set seen = true;
select pg_temp.expect((select seen from public.pain_reports limit 1), 't1 marks pain report seen');
select public.set_chat('00000000-0000-0000-0000-0000000000d1', true);
select public.send_message('00000000-0000-0000-0000-0000000000d1', 'إزيك؟ عامل إيه في التمارين؟');
select pg_temp.expect((select count(*) from public.messages) = 1, 'therapist opens chat and writes to the patient');
select pg_temp.refused($$select public.set_chat('00000000-0000-0000-0000-0000000000d2', true)$$, 't1 cannot open chat for t2''s patient', 'P0001');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select public.send_message(auth.uid(), 'تمام الحمد لله');
select public.mark_messages_read(auth.uid());
select pg_temp.expect((select count(*) from public.messages) = 2 and (select count(*) from public.messages where read_at is not null) = 1,
  'patient replies once chat is open and reads the therapist''s message');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect((select count(*) from public.messages) = 0, 'another therapist cannot read the chat');

-- ================================================================ clinic admin
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((select count(*) from public.profiles where role = 'patient') = 3, 'clinic admin sees all patients of the clinic');
select pg_temp.expect((select count(*) from public.profiles where clinic_id = '00000000-0000-0000-0000-0000000000c2') = 0, 'clinic admin sees nothing of other clinics');
select pg_temp.refused($$select public.transfer_patient('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b1')$$,
  'admin cannot transfer another clinic''s patient', 'P0001');
select pg_temp.refused($$select public.transfer_patient('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b3')$$,
  'admin cannot transfer to another clinic''s therapist', 'P0001');
select public.transfer_patient('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect(true, 'admin transfers p1 from t1 to t2');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect((select count(*) from public.prescriptions where patient_id = '00000000-0000-0000-0000-0000000000d1') = 5, 'former therapist still reads history');
select pg_temp.expect((select count(*) from public.messages) = 2, 'former therapist still reads the chat history');
select pg_temp.refused($$insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time)
  values ('00000000-0000-0000-0000-0000000000d1', auth.uid(), 'slr', 3, 10, '18:00')$$, 'former therapist cannot prescribe');
select pg_temp.refused($$select public.send_message('00000000-0000-0000-0000-0000000000d1', 'hi')$$, 'former therapist cannot write in the chat', 'P0001');

-- ================================================================ templates and appointments
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.expect(public.save_template_from_patient('00000000-0000-0000-0000-0000000000d1', 'ACL week 0–2') > 0, 'new therapist saves p1''s program as a template');
select pg_temp.expect(public.apply_template('00000000-0000-0000-0000-0000000000d2', (select id from public.program_templates limit 1)) = 5,
  'template is applied to another patient in one step');
insert into public.appointments (clinic_id, patient_id, therapist_id, starts_at, created_by)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', auth.uid(), '2026-03-12 10:00+02', auth.uid());
select pg_temp.expect(true, 'therapist books a clinic session for the patient');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.expect((select count(*) from public.appointments) = 1, 'patient sees own appointment');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3');
select pg_temp.expect((select count(*) from public.appointments) = 0, 'other patients do not see it');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
select pg_temp.expect((select count(*) from public.program_templates) = 0, 'other clinic does not see the template');
select pg_temp.refused($$insert into public.appointments (clinic_id, patient_id, therapist_id, starts_at, created_by)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', auth.uid(), now(), auth.uid())$$,
  'other clinic cannot book for this patient');

-- ================================================================ second clinic, own time zone
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
select pg_temp.expect((select state from public.today_plan()) = 'open', 'Berlin patient: 08:30 session is open at 09:00 Berlin time');

-- ================================================================ platform owner
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.clinics) = 2, 'owner sees all clinics');
select pg_temp.expect((select count(*) from public.profiles where role in ('admin','therapist')) = 5, 'owner sees clinic staff');
select pg_temp.expect((select count(*) from public.profiles where role = 'patient') = 0 and (select count(*) from public.prescriptions) = 0,
  'owner never sees patients or their health data');

-- ================================================================ server jobs
reset role;
set role service_role;
select pg_temp.expect((select string_agg(prescription_id::text, ',') from public.due_reminders()) = '5', 'reminder is due for the session that just opened');
reset role;
-- p2 has a session every day and did nothing on 03-08 and 03-09
set role service_role;
select pg_temp.expect(public.daily_checks() >= 1, 'daily check finds patients who missed two days');
select pg_temp.expect(public.daily_checks() = 0, 'daily check does not repeat itself');
reset role;
select pg_temp.expect((select count(*) from public.notification_outbox where patient_id = '00000000-0000-0000-0000-0000000000d2') = 1
  and exists (select 1 from public.patient_events where patient_id = '00000000-0000-0000-0000-0000000000d2' and kind = 'missed_2_days'),
  'encouragement is queued for the patient and logged in the record');

-- ================================================================ anonymous
set role anon;
select pg_temp.refused('select 1 from public.profiles', 'anonymous visitors read nothing');
reset role;
\echo ALL TESTS PASSED
