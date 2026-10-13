begin;

-- Mitgliedsanträge von /registration. Der Vorstand prüft sie unter Vorstand →
-- Anträge, kann sie korrigieren, Rückfragen stellen und sie annehmen oder
-- ablehnen. Erst beim Annehmen entsteht das Mitglied in Campai (Kontakt,
-- Debitor, Verträge, Rechnung); bis dahin lebt der Antrag nur hier.
--
-- Eine Tabelle, kein Ereignisprotokoll: `submitted_data` hält die Einreichung
-- unverändert fest, `data` den korrigierten Stand — was geändert wurde, ergibt
-- der Vergleich. `history` sagt nur, wer wann was getan hat. `campai` sammelt
-- die IDs der Schritte beim Annehmen, damit ein erneuter Klick nach einem
-- Fehler dort weitermacht, wo er abbrach.
create table if not exists public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  -- Fortlaufend je Jahr: A-2026-001. Vergibt der Trigger unten.
  number text not null unique,
  status text not null default 'pending'
    check (status in (
      'pending', 'inquiry', 'invoice_draft', 'welcomed', 'completed', 'rejected'
    )),
  -- Für Liste und Suche aus `data` gespiegelt.
  email text not null,
  first_name text not null,
  last_name text not null,
  submitted_data jsonb not null,
  data jsonb not null,
  -- PNG-Data-URLs; geleert, sobald der Antrag als PDF in Campai liegt.
  signatures jsonb,
  campai jsonb not null default '{}'::jsonb,
  rejection_reason text,
  history jsonb not null default '[]'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_applications_rejection_reason check (
    status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0
  )
);

create index if not exists membership_applications_status_idx
  on public.membership_applications (status, created_at desc);

create or replace function public.set_membership_application_number()
returns trigger
language plpgsql
as $$
declare
  year text := to_char(coalesce(new.created_at, now()), 'YYYY');
  next_number integer;
begin
  if new.number is not null then
    return new;
  end if;
  -- Zwei gleichzeitige Anträge sollen nicht dieselbe Nummer ziehen.
  perform pg_advisory_xact_lock(hashtext('membership_applications.number'));
  select coalesce(max(substring(number from 8)::integer), 0) + 1
    into next_number
    from public.membership_applications
    where number like 'A-' || year || '-%';
  new.number := 'A-' || year || '-' || lpad(next_number::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists membership_applications_number
  on public.membership_applications;
create trigger membership_applications_number
  before insert on public.membership_applications
  for each row execute function public.set_membership_application_number();

-- Antragstellende haben kein Konto, der Vorstand arbeitet über die App: Zugriff
-- nur mit dem Service-Role-Client, nachdem die App members.onboarding geprüft
-- hat. Ohne Policy kommt sonst niemand an die Zeilen.
alter table public.membership_applications enable row level security;

commit;
