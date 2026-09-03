alter table public.resources
  add column if not exists is_private boolean not null default false;

drop policy if exists "Authenticated users can read resources" on public.resources;

create policy "Authenticated users can read resources"
on public.resources
for select
using (
  auth.role() = 'authenticated'
  and (
    not coalesce(is_private, false)
    or exists (
      select 1
      from public.user_access access
      where access.user_id = auth.uid()
        and (
          access.role = 'admin'
          or 'admin' = any(coalesce(access.roles, '{}'::text[]))
        )
    )
  )
);

drop policy if exists "Authenticated users can read resource links" on public.resource_links;

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
        or exists (
          select 1
          from public.user_access access
          where access.user_id = auth.uid()
            and (
              access.role = 'admin'
              or 'admin' = any(coalesce(access.roles, '{}'::text[]))
            )
        )
      )
  )
  and exists (
    select 1
    from public.resources r
    where r.id = resource_b
      and (
        not coalesce(r.is_private, false)
        or exists (
          select 1
          from public.user_access access
          where access.user_id = auth.uid()
            and (
              access.role = 'admin'
              or 'admin' = any(coalesce(access.roles, '{}'::text[]))
            )
        )
      )
  )
);

drop policy if exists "Authenticated users can read resource pretty titles" on public.resource_pretty_titles;

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
        or exists (
          select 1
          from public.user_access access
          where access.user_id = auth.uid()
            and (
              access.role = 'admin'
              or 'admin' = any(coalesce(access.roles, '{}'::text[]))
            )
        )
      )
  )
);
