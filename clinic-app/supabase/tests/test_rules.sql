-- Run after the shim and migrations on a scratch database:
--   psql -v ON_ERROR_STOP=1 -f supabase_shim.sql -f ../migrations/0001_init.sql \
--        -f ../migrations/0002_seed_acl.sql -f test_rules.sql
\set ON_ERROR_STOP 1
\set QUIET 1

-- Freeze the clock: Tuesday 2026-03-10, 10:00 Cairo time.
create or replace function public.local_now() returns timestamp language sql stable as
  $$ select timestamp '2026-03-10 10:00' $$;

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- a admin, t1/t2 therapists, p1 (t1), p2 (t2), p3 (t1, streak tests)
insert into auth.users (id) values
 ('a0000000-0000-0000-0000-000000000000'), ('b1000000-0000-0000-0000-000000000000'),
 ('b2000000-0000-0000-0000-000000000000'), ('c1000000-0000-0000-0000-000000000000'),
 ('c2000000-0000-0000-0000-000000000000'), ('c3000000-0000-0000-0000-000000000000');
insert into public.profiles (id, role, full_name, phone, treatment_start) values
 ('a0000000-0000-0000-0000-000000000000', 'admin', 'Admin', null, null),
 ('b1000000-0000-0000-0000-000000000000', 'therapist', 'Therapist One', null, null),
 ('b2000000-0000-0000-0000-000000000000', 'therapist', 'Therapist Two', null, null),
 ('c1000000-0000-0000-0000-000000000000', 'patient', 'Patient One', '01000000001', '2026-03-01'),
 ('c2000000-0000-0000-0000-000000000000', 'patient', 'Patient Two', '01000000002', '2026-03-01'),
 ('c3000000-0000-0000-0000-000000000000', 'patient', 'Patient Three', '01000000003', '2026-03-01');
insert into public.assignments (patient_id, therapist_id) values
 ('c1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000'),
 ('c2000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000000'),
 ('c3000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000');
-- p1: one session in each window state at 10:00
insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time, created_at) values
 ('c1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'slr', 3, 10, '09:30', '2026-03-01'),     -- 1 open
 ('c1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'quadset', 3, 10, '07:30', '2026-03-01'), -- 2 late
 ('c1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'pumps', 1, 20, '06:00', '2026-03-01'),   -- 3 closed
 ('c1000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'bridge', 3, 10, '12:00', '2026-03-01'),  -- 4 upcoming
 ('c2000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000000', 'slr', 3, 10, '09:30', '2026-03-01'),     -- 5 p2
 ('c3000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000000', 'slr', 3, 10, '08:00', '2026-03-01');     -- 6 p3
-- p3 did 03-05 .. 03-09; today's 08:00 session is in its late window (pending)
insert into public.completions (prescription_id, patient_id, day)
select 6, 'c3000000-0000-0000-0000-000000000000', d::date from generate_series('2026-03-05'::date, '2026-03-09', '1 day') d;

-- ================= patient p1
set role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000000', false);

select pg_temp.expect((select count(*) from public.profiles) = 1, 'patient sees only own profile');
select pg_temp.expect((select count(*) from public.prescriptions) = 4, 'patient sees only own prescriptions');
select pg_temp.expect((select string_agg(state, ',' order by prescription_id) from public.today_plan()) = 'open,late,closed,upcoming',
  'today_plan window states');
select pg_temp.expect((public.complete_exercise(1)->>'late')::boolean = false, 'complete on time');
select pg_temp.expect((public.complete_exercise(2)->>'late')::boolean = true, 'complete during grace hour is marked late');
do $$ begin perform public.complete_exercise(3); raise exception using errcode = 'T0001', message = 'closed session completed';
exception when sqlstate 'P0001' then null; end $$;
select pg_temp.expect(true, 'closed session is refused');
do $$ begin perform public.complete_exercise(4); raise exception using errcode = 'T0001', message = 'upcoming session completed';
exception when sqlstate 'P0001' then null; end $$;
select pg_temp.expect(true, 'upcoming session is refused');
do $$ begin perform public.complete_exercise(5); raise exception using errcode = 'T0001', message = 'completed another patient''s exercise';
exception when sqlstate 'P0001' then null; end $$;
select pg_temp.expect(true, 'cannot complete another patient''s prescription');
do $$ begin insert into public.completions (prescription_id, patient_id, day) values (3, auth.uid(), '2026-03-10');
raise exception using errcode = 'T0001', message = 'direct insert allowed';
exception when insufficient_privilege then null; end $$;
select pg_temp.expect(true, 'patient cannot insert completions directly');
do $$ begin update public.profiles set role = 'admin' where id = auth.uid();
raise exception using errcode = 'T0001', message = 'role changed';
exception when insufficient_privilege then null; end $$;
select pg_temp.expect(true, 'patient cannot change own role');
update public.profiles set gender = 'female', birth_year = 1990, avatar = '{"skin":2,"hijab":true}', onboarded = true where id = auth.uid();
select pg_temp.expect((select onboarded from public.profiles where id = auth.uid()), 'patient saves onboarding/avatar');
do $$ begin perform public.transfer_patient(auth.uid(), 'b2000000-0000-0000-0000-000000000000');
raise exception using errcode = 'T0001', message = 'patient transferred';
exception when sqlstate 'P0001' then null; end $$;
select pg_temp.expect(true, 'patient cannot transfer');
do $$ begin perform public.occurrences('c2000000-0000-0000-0000-000000000000', '2026-03-10');
raise exception using errcode = 'T0001', message = 'internal helper callable';
exception when insufficient_privilege then null; end $$;
select pg_temp.expect(true, 'internal schedule helper is not callable by users');
select pg_temp.expect(public.day_status(auth.uid(), '2026-03-10') = 'pending', 'p1 today pending while a session is upcoming');
select public.report_pain('الركبة وارمة');
select pg_temp.expect(public.day_status(auth.uid(), '2026-03-10') = 'rest', 'pain report makes today a rest day');
do $$ begin perform public.streak_info('c2000000-0000-0000-0000-000000000000');
raise exception using errcode = 'T0001', message = 'read other streak';
exception when sqlstate 'P0001' then null; end $$;
select pg_temp.expect(true, 'cannot read another patient''s streak');

-- ================= patient p3: streak + restore
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000000', false);
select pg_temp.expect((public.streak_info(auth.uid())->>'streak')::int = 5, 'streak counts 5 done days, today pending');
select pg_temp.expect(public.day_status(auth.uid(), '2026-02-27') = 'none', 'days before treatment start do not count');
reset role;
delete from public.completions where prescription_id = 6 and day = '2026-03-09';
set role authenticated;
select pg_temp.expect((public.streak_info(auth.uid())->>'streak')::int = 0, 'missing yesterday breaks the streak');
select pg_temp.expect(public.streak_info(auth.uid())->>'restorable_day' = '2026-03-09', 'yesterday can be restored');
select pg_temp.expect((public.restore_streak()->>'streak')::int = 4, 'restore keeps the streak (restored day adds nothing)');
reset role;
delete from public.completions where prescription_id = 6 and day = '2026-03-08';
set role authenticated;
select pg_temp.expect(public.streak_info(auth.uid())->>'restorable_day' is null, 'older missed day / second restore in the same week is not offered');
do $$ begin perform public.restore_streak(); raise exception using errcode = 'T0001', message = 'second restore';
exception when sqlstate 'P0001' then null; end $$;
select pg_temp.expect(true, 'second restore in the same week is refused');

-- ================= therapists
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000000', false);
select pg_temp.expect((select count(*) from public.profiles where role = 'patient') = 2, 't1 sees only own patients');
select pg_temp.expect((select count(*) from public.pain_reports) = 1, 't1 sees p1 pain report');
insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time, extra_caution_ar)
values ('c1000000-0000-0000-0000-000000000000', auth.uid(), 'heelslide', 3, 15, '18:00', 'لحد 90 درجة بس');
select pg_temp.expect(true, 't1 prescribes for own patient');
do $$ begin insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time)
values ('c2000000-0000-0000-0000-000000000000', auth.uid(), 'slr', 3, 10, '18:00');
raise exception using errcode = 'T0001', message = 'prescribed for other patient';
exception when insufficient_privilege then null; end $$;
select pg_temp.expect(true, 't1 cannot prescribe for t2''s patient');
update public.pain_reports set seen = true;
select pg_temp.expect((select seen from public.pain_reports limit 1), 't1 marks pain report seen');

-- ================= admin transfers p1 to t2
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000000', false);
select pg_temp.expect((select count(*) from public.profiles) = 6, 'admin sees everyone');
select public.transfer_patient('c1000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000000');
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000000', false);
select pg_temp.expect((select count(*) from public.prescriptions where patient_id = 'c1000000-0000-0000-0000-000000000000') = 5,
  'former therapist still reads history');
do $$ begin insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time)
values ('c1000000-0000-0000-0000-000000000000', auth.uid(), 'slr', 3, 10, '18:00');
raise exception using errcode = 'T0001', message = 'former therapist prescribed';
exception when insufficient_privilege then null; end $$;
select pg_temp.expect(true, 'former therapist cannot prescribe');
update public.prescriptions set active = false where patient_id = 'c1000000-0000-0000-0000-000000000000';
select set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000000', false);
select pg_temp.expect((select count(*) from public.prescriptions where patient_id = 'c1000000-0000-0000-0000-000000000000' and active) = 5,
  'former therapist update was silently blocked by RLS');
insert into public.prescriptions (patient_id, therapist_id, exercise_slug, sets, reps, scheduled_time)
values ('c1000000-0000-0000-0000-000000000000', auth.uid(), 'slr', 3, 10, '18:00');
select pg_temp.expect(true, 'new therapist prescribes');

-- ================= anon
reset role;
set role anon;
do $$ begin perform 1 from public.profiles; raise exception using errcode = 'T0001', message = 'anon read profiles';
exception when insufficient_privilege then null; end $$;
select pg_temp.expect(true, 'anonymous visitors read nothing');
reset role;
\echo ALL TESTS PASSED
