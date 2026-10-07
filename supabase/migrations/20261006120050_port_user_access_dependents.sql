-- Alles, was seit der Abzweigung neu an user_access hängt, auf das Modell
-- „Rollen mit Geltungsbereich“ umstellen — vor
-- 20261006120100_drop_user_access.sql, das sonst an diesen Policies scheitert.
begin;

-- Backend (OAuth ins Payload-CMS) wird eine eigene Rolle (backend.login).
insert into public.role_assignments (user_id, role, scope_id, can_grant)
select user_id, 'backend', null, false
from public.user_access
where roles @> array['backend']::text[]
on conflict do nothing;

-- Newsletter-Entwürfe: newsletter.manage prüft die App, die RLS erlaubt
-- jedem nur die eigenen Entwürfe.
drop policy if exists "Admins can read own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Admins can insert own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Admins can update own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Admins can delete own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Newsletter team can read own drafts"
  on public.newsletter_drafts;
drop policy if exists "Newsletter team can insert own drafts"
  on public.newsletter_drafts;
drop policy if exists "Newsletter team can update own drafts"
  on public.newsletter_drafts;
drop policy if exists "Newsletter team can delete own drafts"
  on public.newsletter_drafts;
drop policy if exists "Owners can read own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Owners can insert own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Owners can update own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Owners can delete own newsletter drafts"
  on public.newsletter_drafts;

create policy "Owners can read own newsletter drafts"
on public.newsletter_drafts
for select
using (created_by = auth.uid());

create policy "Owners can insert own newsletter drafts"
on public.newsletter_drafts
for insert
with check (created_by = auth.uid());

create policy "Owners can update own newsletter drafts"
on public.newsletter_drafts
for update
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Owners can delete own newsletter drafts"
on public.newsletter_drafts
for delete
using (created_by = auth.uid());

-- Private Showcases: Die RLS zeigt sie nur ihren Eigentümern. Wer
-- showcase.private hat, liest sie über den Service-Role-Client.
drop policy if exists "Authenticated users can read resources"
  on public.resources;
create policy "Authenticated users can read resources"
on public.resources
for select
using (
  auth.role() = 'authenticated'
  and (
    not coalesce(is_private, false)
    or owner_id = auth.uid()
  )
);

drop policy if exists "Authenticated users can read resource links"
  on public.resource_links;
create policy "Authenticated users can read resource links"
on public.resource_links
for select
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where r.id = resource_a
      and (
        not coalesce(r.is_private, false)
        or r.owner_id = auth.uid()
      )
  )
  and exists (
    select 1
    from public.resources r
    where r.id = resource_b
      and (
        not coalesce(r.is_private, false)
        or r.owner_id = auth.uid()
      )
  )
);

drop policy if exists "Authenticated users can read resource pretty titles"
  on public.resource_pretty_titles;
create policy "Authenticated users can read resource pretty titles"
on public.resource_pretty_titles
for select
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and (
        not coalesce(r.is_private, false)
        or r.owner_id = auth.uid()
      )
  )
);

notify pgrst, 'reload schema';

commit;
