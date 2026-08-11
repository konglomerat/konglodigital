begin;

alter table public.user_access
  add column if not exists roles text[] not null default '{member}'::text[];

update public.user_access
set roles = case role
  when 'admin' then array['admin']::text[]
  when 'accounting' then array['buchhaltung']::text[]
  else array['member']::text[]
end
where roles = array['member']::text[];

alter table public.user_access
  drop constraint if exists user_access_roles_check;
alter table public.user_access
  add constraint user_access_roles_check
  check (
    cardinality(roles) > 0
    and roles <@ array['admin', 'vhc', 'buchhaltung', 'member']::text[]
  );

alter table public.volkshaus_booking_requests
  add column if not exists backup_assigned_user_id uuid
  references auth.users (id) on delete set null;

drop policy if exists "Admins can read VHC bookings"
  on public.volkshaus_booking_requests;
drop policy if exists "Admins can update VHC bookings"
  on public.volkshaus_booking_requests;
drop policy if exists "Admins can read VHC booking events"
  on public.volkshaus_booking_events;
drop policy if exists "VHC team can read bookings"
  on public.volkshaus_booking_requests;
drop policy if exists "VHC team can update bookings"
  on public.volkshaus_booking_requests;
drop policy if exists "VHC team can read booking events"
  on public.volkshaus_booking_events;

create policy "VHC team can read bookings"
on public.volkshaus_booking_requests
for select
using (
  exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and user_access.roles && array['admin', 'vhc']::text[]
  )
);

create policy "VHC team can update bookings"
on public.volkshaus_booking_requests
for update
using (
  exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and user_access.roles && array['admin', 'vhc']::text[]
  )
)
with check (
  exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and user_access.roles && array['admin', 'vhc']::text[]
  )
);

create policy "VHC team can read booking events"
on public.volkshaus_booking_events
for select
using (
  exists (
    select 1
    from public.user_access
    where user_access.user_id = auth.uid()
      and user_access.roles && array['admin', 'vhc']::text[]
  )
);

update auth.users as users
set raw_app_meta_data =
  coalesce(users.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'roles', to_jsonb(access.roles),
    'role', access.role
  )
from public.user_access as access
where access.user_id = users.id;

notify pgrst, 'reload schema';

commit;
