begin;

alter table public.user_access
  drop constraint if exists user_access_roles_check;

alter table public.user_access
  add constraint user_access_roles_check
  check (
    cardinality(roles) > 0
    and roles <@ array[
      'admin',
      'backend',
      'vhc',
      'buchhaltung',
      'werkbereich_lead',
      'member'
    ]::text[]
  );

update auth.users as users
set raw_app_meta_data =
  coalesce(users.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'roles', to_jsonb(access.roles),
    'role', access.role,
    'rights', to_jsonb(access.rights)
  )
from public.user_access as access
where access.user_id = users.id;

notify pgrst, 'reload schema';

commit;
