begin;

-- Die neue Stornierungsfunktion liest diese Spalten auch bei offenen Anträgen.
-- Die ursprüngliche Ehrenamtsbonus-Migration legt sie noch nicht an.
alter table public.ehrenamtsbonus_requests
  add column if not exists cancellation_note text,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null,
  add column if not exists cancelled_at timestamptz;

alter table public.ehrenamtsbonus_requests
  drop constraint if exists ehrenamtsbonus_requests_status_check;
alter table public.ehrenamtsbonus_requests
  add constraint ehrenamtsbonus_requests_status_check
  check (status in ('in_review', 'approved', 'rejected', 'cancelled'));

alter table public.ehrenamtsbonus_requests
  drop constraint if exists ehrenamtsbonus_cancellation_complete;
alter table public.ehrenamtsbonus_requests
  add constraint ehrenamtsbonus_cancellation_complete check (
    (status = 'cancelled'
      and cancelled_at is not null
      and cancellation_note is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  );

commit;
