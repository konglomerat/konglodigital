-- Das alte Rollenmodell entfernen: user_access, has_right(), alle Policies,
-- die daran hängen, und die Rollen-Kopie in app_metadata.
-- Erst einspielen, wenn 20261006120000_scopes_and_role_assignments.sql
-- gelaufen ist und der Code mit role_assignments live ist.
--
-- Rollen prüft ab jetzt nur noch der Code (src/lib/access/). Was eine Rolle
-- erlaubt, schreibt die App danach mit dem Service-Role-Client. Die RLS
-- regelt nur noch, was jedes Mitglied mit seinen eigenen Zeilen darf.
begin;

-- Volkshaus: liest und schreibt die App nur mit dem Service-Role-Client;
-- ohne Policies bleiben die Tabellen für alle anderen zu.
drop policy if exists "VHC team can read bookings"
  on public.volkshaus_booking_requests;
drop policy if exists "VHC team can update bookings"
  on public.volkshaus_booking_requests;
drop policy if exists "VHC team can read booking events"
  on public.volkshaus_booking_events;

-- Ehrenamtsbonus: Anträge aller sieht und entscheidet nur der Vorstand
-- (ehrenamtsbonus.manage), über den Service-Role-Client. Die Policies für
-- eigene Anträge bleiben.
drop policy if exists "Vorstand can read ehrenamtsbonus requests"
  on public.ehrenamtsbonus_requests;
drop policy if exists "Vorstand can update ehrenamtsbonus requests"
  on public.ehrenamtsbonus_requests;

-- Ressourcen: Anlegen darf jedes Mitglied, eigene Einträge bearbeiten auch.
-- Fremde bearbeiten (Rolle Inventar bzw. Showcase) und Inventar löschen
-- laufen über den Service-Role-Client.
drop policy if exists "Owners can insert resources" on public.resources;
drop policy if exists "Owners can update resources" on public.resources;
drop policy if exists "Owners can delete resources" on public.resources;

create policy "Members can insert own resources"
on public.resources
for insert
with check (auth.uid() = owner_id);

create policy "Owners can update resources"
on public.resources
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Owners can delete own showcases"
on public.resources
for delete
using (
  owner_id = auth.uid()
  and lower(btrim(coalesce(type, ''))) = 'project'
);

drop policy if exists "Authorized users can insert resource links"
  on public.resource_links;
drop policy if exists "Authorized users can delete resource links"
  on public.resource_links;

create policy "Owners can insert resource links"
on public.resource_links
for insert
with check (
  exists (
    select 1
    from public.resources r
    where (r.id = resource_a or r.id = resource_b)
      and r.owner_id = auth.uid()
  )
);

create policy "Owners can delete resource links"
on public.resource_links
for delete
using (
  exists (
    select 1
    from public.resources r
    where (r.id = resource_a or r.id = resource_b)
      and r.owner_id = auth.uid()
  )
);

drop policy if exists "Authorized users can insert resource pretty titles"
  on public.resource_pretty_titles;
drop policy if exists "Authorized users can update resource pretty titles"
  on public.resource_pretty_titles;
drop policy if exists "Authorized users can delete resource pretty titles"
  on public.resource_pretty_titles;

create policy "Owners can insert resource pretty titles"
on public.resource_pretty_titles
for insert
with check (
  exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and r.owner_id = auth.uid()
  )
);

create policy "Owners can update resource pretty titles"
on public.resource_pretty_titles
for update
using (
  exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and r.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and r.owner_id = auth.uid()
  )
);

create policy "Owners can delete resource pretty titles"
on public.resource_pretty_titles
for delete
using (
  exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and r.owner_id = auth.uid()
  )
);

-- Ohne cascade: Hängt noch etwas daran, bricht die Migration ab, statt es
-- still mitzulöschen.
drop function if exists public.has_right(text);
drop table if exists public.user_access;

update auth.users
set raw_app_meta_data = raw_app_meta_data - 'roles' - 'role' - 'rights'
where raw_app_meta_data ?| array['roles', 'role', 'rights'];

notify pgrst, 'reload schema';

commit;
