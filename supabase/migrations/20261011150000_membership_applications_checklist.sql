begin;

-- Aufnahme nach dem Annehmen: was der Vorstand abhakt, bis aus dem Antrag ein
-- Mitglied geworden ist — Roseguarden-Konto, Zahlung, Zugangskarte.
-- Je Punkt `{at, by, cardNumber?}`; `by` ist null, wenn Campai die Zahlung
-- gemeldet hat.
alter table public.membership_applications
  add column if not exists checklist jsonb not null default '{}'::jsonb;

commit;
