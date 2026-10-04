begin;

-- Ehrenamtsbonus: aktive Mitglieder beantragen für ehrenamtliches Engagement
-- entweder 10 Zugangstage pro Quartal oder uneingeschränkten Zugang. Ein
-- Vorstandsmitglied entscheidet allein — es wird nicht abgestimmt, festgehalten
-- wird nur, wer entschieden hat.
--
-- Ein bestehendes Abo wird für den Bonuszeitraum pausiert und durch die
-- beantragte Option ersetzt. Was eine Bewilligung auslöst, hängt damit allein
-- am Zugang, den das Mitglied beim Einreichen hatte — dieser Zugang wird
-- mitgeschrieben und nicht später neu ermittelt. Der Beitragsstand dagegen
-- steht nicht hier: er kommt live aus Campai (offene Forderung des Debitors).
create table if not exists public.ehrenamtsbonus_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'in_review'
    check (status in ('in_review', 'approved', 'rejected')),
  -- Momentaufnahme aus den Systemdaten beim Einreichen; im Formular steht sie
  -- dem Mitglied nur lesend gegenüber.
  current_access text not null
    check (current_access in ('keine_karte', 'punktekarte', 'abo_klein', 'abo_gross')),
  -- „anerkennung" ändert nichts am Zugang: der Antrag läuft trotzdem durch die
  -- Prüfung und ist die Grundlage für das Abzeichen im Profil.
  requested_option text not null
    check (requested_option in ('tage_10', 'unbegrenzt', 'anerkennung')),
  -- Mehrfachauswahl: wo im Verein war das Mitglied aktiv?
  werkbereiche text[] not null default '{}'::text[],
  -- Der Bonus wirkt immer ab Quartalsbeginn und ist befristet.
  valid_from date not null,
  valid_until date not null,
  reason text not null,
  decision_note text,
  -- Wer entschieden hat. Bleibt beim Löschen des Kontos leer, die Entscheidung
  -- selbst bleibt bestehen — deshalb prüft der Constraint unten nur das Datum.
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ehrenamtsbonus_validity_order check (valid_until > valid_from),
  constraint ehrenamtsbonus_werkbereiche_present
    check (cardinality(werkbereiche) > 0),
  constraint ehrenamtsbonus_decision_complete check (
    (status = 'in_review' and decided_at is null)
    or (status <> 'in_review' and decided_at is not null)
  )
);

-- Eine frühere Fassung dieser Migration kannte noch Abstimmung, Rückfragen,
-- Entwürfe, einen gespeicherten Beitragsstatus und die Abo-groß-Variante und
-- kannte „Nur Anerkennung" noch nicht. Wer sie schon eingespielt hat, wird
-- hier mitgenommen.
drop table if exists public.ehrenamtsbonus_votes;

alter table public.ehrenamtsbonus_requests
  drop constraint if exists ehrenamtsbonus_variant_scope;
alter table public.ehrenamtsbonus_requests
  drop column if exists membership_fee_status;
alter table public.ehrenamtsbonus_requests
  drop column if exists abo_gross_variant;
-- `updated_at` war immer eine Kopie von created_at bzw. decided_at: die Zeile
-- wird genau zweimal geschrieben, beim Einreichen und beim Entscheiden.
alter table public.ehrenamtsbonus_requests
  drop column if exists updated_at;
alter table public.ehrenamtsbonus_requests
  add column if not exists decided_by uuid references auth.users (id) on delete set null;

update public.ehrenamtsbonus_requests
set status = 'in_review',
    decided_at = null
where status in ('draft', 'needs_info');

alter table public.ehrenamtsbonus_requests
  drop constraint if exists ehrenamtsbonus_requests_requested_option_check;
alter table public.ehrenamtsbonus_requests
  add constraint ehrenamtsbonus_requests_requested_option_check
  check (requested_option in ('tage_10', 'unbegrenzt', 'anerkennung'));

alter table public.ehrenamtsbonus_requests
  drop constraint if exists ehrenamtsbonus_requests_status_check;
alter table public.ehrenamtsbonus_requests
  add constraint ehrenamtsbonus_requests_status_check
  check (status in ('in_review', 'approved', 'rejected'));

alter table public.ehrenamtsbonus_requests
  drop constraint if exists ehrenamtsbonus_decision_complete;
alter table public.ehrenamtsbonus_requests
  add constraint ehrenamtsbonus_decision_complete check (
    (status = 'in_review' and decided_at is null)
    or (status <> 'in_review' and decided_at is not null)
  );

create index if not exists ehrenamtsbonus_requests_user_idx
  on public.ehrenamtsbonus_requests (user_id, created_at desc);
create index if not exists ehrenamtsbonus_requests_status_idx
  on public.ehrenamtsbonus_requests (status, valid_until);

alter table public.ehrenamtsbonus_requests enable row level security;

drop policy if exists "Users can read own ehrenamtsbonus requests"
  on public.ehrenamtsbonus_requests;
drop policy if exists "Users can insert own ehrenamtsbonus requests"
  on public.ehrenamtsbonus_requests;
drop policy if exists "Vorstand can read ehrenamtsbonus requests"
  on public.ehrenamtsbonus_requests;
drop policy if exists "Vorstand can update ehrenamtsbonus requests"
  on public.ehrenamtsbonus_requests;

create policy "Users can read own ehrenamtsbonus requests"
on public.ehrenamtsbonus_requests
for select
using (auth.uid() = user_id);

-- Ein Mitglied darf einen Antrag stellen, aber nicht entscheiden: alles, was
-- zur Entscheidung gehört, muss beim Einfügen leer sein. Ohne diese Bedingung
-- könnte ein Mitglied am API-Weg vorbei eine Zeile mit status = 'approved'
-- einfügen — die Route ist nicht die Grenze, die Policy ist es.
create policy "Users can insert own ehrenamtsbonus requests"
on public.ehrenamtsbonus_requests
for insert
with check (
  auth.uid() = user_id
  and status = 'in_review'
  and decision_note is null
  and decided_by is null
  and decided_at is null
);

create policy "Vorstand can read ehrenamtsbonus requests"
on public.ehrenamtsbonus_requests
for select
using (
  exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and user_access.roles && array['admin']::text[]
  )
);

create policy "Vorstand can update ehrenamtsbonus requests"
on public.ehrenamtsbonus_requests
for update
using (
  exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and user_access.roles && array['admin']::text[]
  )
)
with check (
  exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and user_access.roles && array['admin']::text[]
  )
);

commit;
