create table if not exists public.newsletter_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  design text not null default 'konglomerat'
    check (design in ('konglomerat', 'volkshaus-cotta')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists newsletter_drafts_created_by_updated_at_idx
  on public.newsletter_drafts (created_by, updated_at desc);

alter table public.newsletter_drafts enable row level security;

drop policy if exists "Admins can read own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Admins can insert own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Admins can update own newsletter drafts"
  on public.newsletter_drafts;
drop policy if exists "Admins can delete own newsletter drafts"
  on public.newsletter_drafts;

create policy "Admins can read own newsletter drafts"
on public.newsletter_drafts
for select
using (
  created_by = auth.uid()
  and exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and 'admin' = any(user_access.roles)
  )
);

create policy "Admins can insert own newsletter drafts"
on public.newsletter_drafts
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and 'admin' = any(user_access.roles)
  )
);

create policy "Admins can update own newsletter drafts"
on public.newsletter_drafts
for update
using (
  created_by = auth.uid()
  and exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and 'admin' = any(user_access.roles)
  )
)
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and 'admin' = any(user_access.roles)
  )
);

create policy "Admins can delete own newsletter drafts"
on public.newsletter_drafts
for delete
using (
  created_by = auth.uid()
  and exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and 'admin' = any(user_access.roles)
  )
);

notify pgrst, 'reload schema';
