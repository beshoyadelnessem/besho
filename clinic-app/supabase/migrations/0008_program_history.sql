-- Every change to a patient's program goes into their record, so the therapist (and the next
-- one after a transfer) can see what was changed and when: an exercise added, edited
-- (time, sets, reps, hold, own caution), stopped or started again.
create or replace function public._log_prescription() returns trigger
language plpgsql security definer set search_path = public as $$
declare changes jsonb := '{}'::jsonb; k text;
begin
  if tg_op = 'INSERT' then
    insert into public.patient_events (patient_id, kind, data)
    values (new.patient_id, 'rx_added', jsonb_build_object('slug', new.exercise_slug, 'by', auth.uid()));
    return new;
  end if;
  if new.active is distinct from old.active then
    insert into public.patient_events (patient_id, kind, data)
    values (new.patient_id, case when new.active then 'rx_resumed' else 'rx_stopped' end,
            jsonb_build_object('slug', new.exercise_slug, 'by', auth.uid()));
  end if;
  foreach k in array array['scheduled_time', 'sets', 'reps', 'hold_sec', 'extra_caution'] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      changes := changes || jsonb_build_object(k, jsonb_build_array(to_jsonb(old) -> k, to_jsonb(new) -> k));
    end if;
  end loop;
  if changes <> '{}'::jsonb then
    insert into public.patient_events (patient_id, kind, data)
    values (new.patient_id, 'rx_changed', jsonb_build_object('slug', new.exercise_slug, 'by', auth.uid(), 'changes', changes));
  end if;
  return new;
end $$;
revoke execute on function public._log_prescription() from public, anon, authenticated;

drop trigger if exists prescriptions_log on public.prescriptions;
create trigger prescriptions_log after insert or update on public.prescriptions
  for each row execute function public._log_prescription();
