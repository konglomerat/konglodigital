-- Rollen mit Geltungsbereich: scopes + role_assignments ersetzen
-- user_access.roles. Welche Rolle was darf, steht im Code
-- (src/lib/access/role-config.ts) — hier nur, wer welche Rolle wo hat.
-- Das alte Modell bleibt vorerst stehen; es fällt erst mit
-- 20261006120100_drop_user_access.sql.
begin;

create table if not exists public.scopes (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  type text not null check (type in ('werkbereich', 'projekt')),
  -- Zweistellige Campai-Kostenstelle 2; darüber filtert die Buchhaltung.
  campai_cost_center text unique check (campai_cost_center ~ '^[0-9]{2}$'),
  created_at timestamptz not null default now()
);

alter table public.scopes enable row level security;

drop policy if exists "Authenticated users can read scopes" on public.scopes;
create policy "Authenticated users can read scopes"
on public.scopes
for select
to authenticated
using (true);

-- Werkbereiche und Projekte der Übersichtsseite /werkbereiche. Buchdruck und
-- Metall sind inaktiv und fehlen bewusst.
insert into public.scopes (id, name, type, campai_cost_center) values
  ('3d-druck', '3D Druck', 'werkbereich', '51'),
  ('siebdruck', 'Siebdruck', 'werkbereich', '52'),
  ('beton', 'Beton', 'werkbereich', '53'),
  ('cnc', 'CNC', 'werkbereich', '54'),
  ('elektronik', 'Elektronik', 'werkbereich', '55'),
  ('darkroom', 'Darkroom', 'werkbereich', '56'),
  ('holz', 'Holz', 'werkbereich', '57'),
  ('kunststoffschmiede', 'Kunststoffschmiede', 'werkbereich', '58'),
  ('laser', 'Laser', 'werkbereich', '59'),
  ('neuweltbib', 'Neuweltbib', 'werkbereich', '60'),
  ('printshop', 'Printshop', 'werkbereich', '61'),
  ('textil', 'Textil', 'werkbereich', '62'),
  ('materialvermittlung', 'Materialvermittlung', 'werkbereich', '63'),
  ('riso', 'Riso', 'werkbereich', '64'),
  ('aenderei', 'Änderei', 'projekt', '70'),
  ('forum', 'FOR:UM', 'projekt', '73'),
  ('tools2go', 'Tools2Go', 'projekt', '78'),
  ('vhc', 'VHC', 'projekt', '80')
on conflict (id) do update
set name = excluded.name,
    type = excluded.type,
    campai_cost_center = excluded.campai_cost_center;

create table if not exists public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role ~ '^[a-z_]+$'),
  -- null = global
  scope_id text references public.scopes (id) on delete cascade,
  can_grant boolean not null default false,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists role_assignments_user_role_scope_key
  on public.role_assignments (user_id, role, coalesce(scope_id, ''));
create index if not exists role_assignments_scope_id_idx
  on public.role_assignments (scope_id);

alter table public.role_assignments enable row level security;

-- Lesen nur die eigenen Zeilen; Vergabe und Übersichten laufen serverseitig
-- mit dem Service-Role-Client, nachdem die App die Berechtigung geprüft hat.
drop policy if exists "Users can read own role assignments"
  on public.role_assignments;
create policy "Users can read own role assignments"
on public.role_assignments
for select
to authenticated
using (user_id = auth.uid());

-- Der letzte globale Admin bleibt. Gilt auch, wenn sein auth.users-Eintrag
-- gelöscht wird (on delete cascade).
create or replace function public.prevent_removing_last_global_admin()
returns trigger
language plpgsql
as $$
begin
  if old.role <> 'admin' or old.scope_id is not null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'admin' and new.scope_id is null then
    return new;
  end if;

  -- Zwei gleichzeitige Entzüge dürfen nicht beide durchrutschen.
  perform pg_advisory_xact_lock(hashtext('role_assignments_global_admin'));

  if not exists (
    select 1
    from public.role_assignments
    where role = 'admin'
      and scope_id is null
      and id <> old.id
  ) then
    raise exception 'Der letzte globale Admin kann nicht entfernt werden.'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists role_assignments_keep_last_global_admin
  on public.role_assignments;
create trigger role_assignments_keep_last_global_admin
before update or delete on public.role_assignments
for each row
execute function public.prevent_removing_last_global_admin();

-- Bestand übernehmen (alt → neu):
--   admin       → admin global, darf vergeben
--   buchhaltung → buchhaltung global
--   vhc         → tools im Bereich vhc
--   member, werkbereich_lead, rights resources:* → keine Zuweisung
insert into public.role_assignments (user_id, role, scope_id, can_grant)
select user_id, 'admin', null, true
from public.user_access
where roles @> array['admin']::text[]
on conflict do nothing;

insert into public.role_assignments (user_id, role, scope_id, can_grant)
select user_id, 'buchhaltung', null, false
from public.user_access
where roles @> array['buchhaltung']::text[]
on conflict do nothing;

insert into public.role_assignments (user_id, role, scope_id, can_grant)
select user_id, 'tools', 'vhc', false
from public.user_access
where roles @> array['vhc']::text[]
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
