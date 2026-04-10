create table if not exists public.print_job_descriptions (
  job_id text primary key,
  owner_id uuid,
  description text,
  updated_at timestamptz not null default now(),
  constraint print_job_descriptions_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete set null
);

alter table public.print_job_descriptions enable row level security;

drop policy if exists "Authenticated users can read descriptions" on public.print_job_descriptions;
drop policy if exists "Authenticated users can insert descriptions" on public.print_job_descriptions;
drop policy if exists "Owners can update descriptions" on public.print_job_descriptions;

create policy "Authenticated users can read descriptions"
on public.print_job_descriptions
for select
using (auth.role() = 'authenticated');

create policy "Authenticated users can insert descriptions"
on public.print_job_descriptions
for insert
with check (auth.uid() = owner_id);

create policy "Owners can update descriptions"
on public.print_job_descriptions
for update
using (owner_id is null or owner_id = auth.uid())
with check (owner_id is null or owner_id = auth.uid());

create table if not exists public.printer_emptying_state (
  printer_id text primary key,
  needs_emptying boolean not null default false,
  last_status text,
  updated_at timestamptz not null default now()
);

alter table public.printer_emptying_state enable row level security;

drop policy if exists "Authenticated users can read emptying state" on public.printer_emptying_state;
drop policy if exists "Authenticated users can insert emptying state" on public.printer_emptying_state;
drop policy if exists "Authenticated users can update emptying state" on public.printer_emptying_state;

create policy "Authenticated users can read emptying state"
on public.printer_emptying_state
for select
using (auth.role() = 'authenticated');

create policy "Authenticated users can insert emptying state"
on public.printer_emptying_state
for insert
with check (auth.role() = 'authenticated');

create policy "Authenticated users can update emptying state"
on public.printer_emptying_state
for update
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create extension if not exists "pgcrypto";

create or replace function public.has_right(required_right text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(
      (
        case
          when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'rights') = 'array'
            then auth.jwt() -> 'app_metadata' -> 'rights'
          when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'rights') = 'string'
            then jsonb_build_array(auth.jwt() -> 'app_metadata' -> 'rights')
          else '[]'::jsonb
        end
      )
      || (
        case
          when jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'rights') = 'array'
            then auth.jwt() -> 'user_metadata' -> 'rights'
          when jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'rights') = 'string'
            then jsonb_build_array(auth.jwt() -> 'user_metadata' -> 'rights')
          else '[]'::jsonb
        end
      )
    ) as right_value
    where right_value = required_right
  );
$$;

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  name text not null,
  pretty_title text,
  description text,
  image text,
  images text[],
  project_links jsonb,
  social_media_consent boolean not null default false,
  workshop_resource_id uuid references public.resources (id) on delete set null,
  gps_latitude double precision,
  gps_longitude double precision,
  gps_altitude double precision,
  type text,
  priority smallint not null default 3,
  attachable boolean not null default false,
  tags text[],
  categories jsonb,
  map_features jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resources add column if not exists gps_latitude double precision;
alter table public.resources add column if not exists gps_longitude double precision;
alter table public.resources add column if not exists gps_altitude double precision;
alter table public.resources add column if not exists priority smallint not null default 3;
alter table public.resources add column if not exists map_features jsonb;
alter table public.resources add column if not exists pretty_title text;
alter table public.resources add column if not exists project_links jsonb;
alter table public.resources add column if not exists social_media_consent boolean not null default false;
alter table public.resources add column if not exists workshop_resource_id uuid references public.resources (id) on delete set null;

create table if not exists public.resource_pretty_titles (
  resource_id uuid not null references public.resources (id) on delete cascade,
  pretty_title text not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint resource_pretty_titles_pk primary key (resource_id, pretty_title)
);

create unique index if not exists resource_pretty_titles_pretty_title_key
  on public.resource_pretty_titles (pretty_title);
create unique index if not exists resource_pretty_titles_current_per_resource_idx
  on public.resource_pretty_titles (resource_id)
  where is_current;

with resource_pretty_base as (
  select
    id as resource_id,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(lower(trim(name)), 'ä', 'ae'),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(id::text, 8)
    ) as base_slug
  from public.resources
), resource_pretty_ranked as (
  select
    resource_id,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as pretty_title
  from resource_pretty_base
)
update public.resources as resources
set pretty_title = ranked.pretty_title
from resource_pretty_ranked as ranked
where resources.id = ranked.resource_id
  and (resources.pretty_title is null or resources.pretty_title = '');

insert into public.resource_pretty_titles (resource_id, pretty_title, is_current)
select id, pretty_title, true
from public.resources
where pretty_title is not null and pretty_title <> ''
on conflict (resource_id, pretty_title)
do update set is_current = excluded.is_current;

update public.resource_pretty_titles as resource_pretty_titles
set is_current = resource_pretty_titles.pretty_title = resources.pretty_title
from public.resources as resources
where resources.id = resource_pretty_titles.resource_id;

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  campai_contact_id text,
  campai_member_number text,
  campai_debtor_account integer,
  campai_segments text[] not null default '{}'::text[],
  campai_name text,
  avatar_url text,
  short_bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_profiles add column if not exists campai_contact_id text;
alter table public.member_profiles add column if not exists campai_member_number text;
alter table public.member_profiles add column if not exists campai_debtor_account integer;
alter table public.member_profiles add column if not exists campai_segments text[] not null default '{}'::text[];
alter table public.member_profiles add column if not exists campai_name text;
alter table public.member_profiles add column if not exists avatar_url text;
alter table public.member_profiles add column if not exists short_bio text;
alter table public.member_profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists member_profiles_campai_contact_id_key
  on public.member_profiles (campai_contact_id)
  where campai_contact_id is not null;
create unique index if not exists member_profiles_campai_member_number_key
  on public.member_profiles (campai_member_number)
  where campai_member_number is not null;

alter table public.member_profiles enable row level security;

drop policy if exists "Users can read own member profile" on public.member_profiles;
drop policy if exists "Users can insert own member profile" on public.member_profiles;
drop policy if exists "Users can update own member profile" on public.member_profiles;

create policy "Users can read own member profile"
on public.member_profiles
for select
using (auth.uid() = user_id);

create policy "Users can insert own member profile"
on public.member_profiles
for insert
with check (auth.uid() = user_id);

create policy "Users can update own member profile"
on public.member_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.user_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member',
  rights text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_access_role_check check (role in ('admin', 'accounting', 'member'))
);

alter table public.user_access add column if not exists role text not null default 'member';
alter table public.user_access add column if not exists rights text[] not null default '{}'::text[];
alter table public.user_access add column if not exists updated_at timestamptz not null default now();

alter table public.user_access enable row level security;

drop policy if exists "Users can read own access" on public.user_access;

create policy "Users can read own access"
on public.user_access
for select
using (auth.uid() = user_id);

create table if not exists public.access_code_inbox (
  id uuid primary key default gen_random_uuid(),
  sender text,
  recipient text,
  subject text,
  access_code text,
  extracted_from text not null default 'none',
  body_preview text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  constraint access_code_inbox_extracted_from_check
    check (extracted_from in ('subject', 'body', 'none'))
);

alter table public.access_code_inbox enable row level security;

drop policy if exists "Authenticated users can read access code inbox" on public.access_code_inbox;
drop policy if exists "Authenticated users can insert access code inbox" on public.access_code_inbox;
drop policy if exists "Authenticated users can update access code inbox" on public.access_code_inbox;
drop policy if exists "Authenticated users can delete access code inbox" on public.access_code_inbox;

create policy "Authenticated users can read access code inbox"
on public.access_code_inbox
for select
using (auth.role() = 'authenticated');

create index if not exists access_code_inbox_created_at_idx
  on public.access_code_inbox (created_at desc);

with normalized_member_profiles as (
  select
    users.id as user_id,
    nullif(btrim(users.raw_user_meta_data ->> 'campai_contact_id'), '') as campai_contact_id,
    nullif(btrim(users.raw_user_meta_data ->> 'campai_member_number'), '') as campai_member_number,
    case
      when nullif(btrim(users.raw_user_meta_data ->> 'campai_debtor_account'), '') is null then null
      else (users.raw_user_meta_data ->> 'campai_debtor_account')::integer
    end as campai_debtor_account,
    case
      when jsonb_typeof(users.raw_user_meta_data -> 'campai_segments') = 'array' then array(
        select jsonb_array_elements_text(users.raw_user_meta_data -> 'campai_segments')
      )
      when jsonb_typeof(users.raw_user_meta_data -> 'campai_segments') = 'string' then array[
        users.raw_user_meta_data ->> 'campai_segments'
      ]
      else '{}'::text[]
    end as campai_segments,
    nullif(btrim(users.raw_user_meta_data ->> 'campai_name'), '') as campai_name,
    nullif(btrim(users.raw_user_meta_data ->> 'avatar_url'), '') as avatar_url,
    nullif(btrim(users.raw_user_meta_data ->> 'short_bio'), '') as short_bio
  from auth.users as users
)
insert into public.member_profiles (
  user_id,
  campai_contact_id,
  campai_member_number,
  campai_debtor_account,
  campai_segments,
  campai_name,
  avatar_url,
  short_bio
)
select
  user_id,
  campai_contact_id,
  campai_member_number,
  campai_debtor_account,
  campai_segments,
  campai_name,
  avatar_url,
  short_bio
from normalized_member_profiles
where campai_contact_id is not null
  or campai_member_number is not null
  or campai_debtor_account is not null
  or array_length(campai_segments, 1) is not null
  or campai_name is not null
  or avatar_url is not null
  or short_bio is not null
on conflict (user_id)
do update set
  campai_contact_id = excluded.campai_contact_id,
  campai_member_number = excluded.campai_member_number,
  campai_debtor_account = excluded.campai_debtor_account,
  campai_segments = excluded.campai_segments,
  campai_name = excluded.campai_name,
  avatar_url = excluded.avatar_url,
  short_bio = excluded.short_bio,
  updated_at = now();

with normalized_user_access as (
  select
    users.id as user_id,
    case
      when lower(btrim(coalesce(users.raw_app_meta_data ->> 'role', users.raw_user_meta_data ->> 'role', 'member'))) in ('admin', 'accounting', 'member')
        then lower(btrim(coalesce(users.raw_app_meta_data ->> 'role', users.raw_user_meta_data ->> 'role', 'member')))
      else 'member'
    end as role,
    coalesce(
      array(
        select distinct right_value
        from (
          select nullif(btrim(jsonb_array_elements_text(
            case
              when jsonb_typeof(users.raw_app_meta_data -> 'rights') = 'array'
                then users.raw_app_meta_data -> 'rights'
              when jsonb_typeof(users.raw_app_meta_data -> 'rights') = 'string'
                then jsonb_build_array(users.raw_app_meta_data -> 'rights')
              else '[]'::jsonb
            end
          )), '') as right_value
          union all
          select nullif(btrim(jsonb_array_elements_text(
            case
              when jsonb_typeof(users.raw_user_meta_data -> 'rights') = 'array'
                then users.raw_user_meta_data -> 'rights'
              when jsonb_typeof(users.raw_user_meta_data -> 'rights') = 'string'
                then jsonb_build_array(users.raw_user_meta_data -> 'rights')
              else '[]'::jsonb
            end
          )), '') as right_value
        ) as normalized_rights
        where right_value is not null
      ),
      '{}'::text[]
    ) as rights
  from auth.users as users
)
insert into public.user_access (user_id, role, rights)
select user_id, role, rights
from normalized_user_access
on conflict (user_id)
do update set
  role = excluded.role,
  rights = excluded.rights,
  updated_at = now();

update auth.users as users
set raw_app_meta_data =
  coalesce(users.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'rights', to_jsonb(access.rights)
  )
from public.user_access as access
where access.user_id = users.id;

create or replace function public.has_right(required_right text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from (
      select unnest(
        coalesce(
          (select rights from public.user_access where user_id = auth.uid()),
          '{}'::text[]
        )
      ) as right_value
      union all
      select jsonb_array_elements_text(
        case
          when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'rights') = 'array'
            then auth.jwt() -> 'app_metadata' -> 'rights'
          when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'rights') = 'string'
            then jsonb_build_array(auth.jwt() -> 'app_metadata' -> 'rights')
          else '[]'::jsonb
        end
      )
    ) as rights
    where right_value = required_right
  );
$$;

drop table if exists public.registration_invites;

with resource_pretty_migration_base as (
  select
    id as resource_id,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(lower(trim(name)), 'ä', 'ae'),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(id::text, 8)
    ) as base_slug
  from public.resources
), resource_pretty_migration_ranked as (
  select
    resource_id,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as pretty_title
  from resource_pretty_migration_base
), resource_pretty_migration_changed as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    ranked.pretty_title as next_pretty_title
  from public.resources as resources
  join resource_pretty_migration_ranked as ranked
    on ranked.resource_id = resources.id
  where coalesce(resources.pretty_title, '') <> ranked.pretty_title
)
insert into public.resource_pretty_titles (resource_id, pretty_title, is_current)
select resource_id, previous_pretty_title, false
from resource_pretty_migration_changed
where previous_pretty_title is not null and previous_pretty_title <> ''
on conflict (resource_id, pretty_title)
do nothing;

with resource_pretty_migration_base as (
  select
    id as resource_id,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(lower(trim(name)), 'ä', 'ae'),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(id::text, 8)
    ) as base_slug
  from public.resources
), resource_pretty_migration_ranked as (
  select
    resource_id,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as pretty_title
  from resource_pretty_migration_base
), resource_pretty_migration_changed as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    ranked.pretty_title as next_pretty_title
  from public.resources as resources
  join resource_pretty_migration_ranked as ranked
    on ranked.resource_id = resources.id
  where coalesce(resources.pretty_title, '') <> ranked.pretty_title
)
insert into public.resource_pretty_titles (resource_id, pretty_title, is_current)
select resource_id, next_pretty_title, true
from resource_pretty_migration_changed
on conflict (resource_id, pretty_title)
do update set is_current = excluded.is_current;

with resource_pretty_migration_base as (
  select
    id as resource_id,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(lower(trim(name)), 'ä', 'ae'),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(id::text, 8)
    ) as base_slug
  from public.resources
), resource_pretty_migration_ranked as (
  select
    resource_id,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as pretty_title
  from resource_pretty_migration_base
), resource_pretty_migration_changed as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    ranked.pretty_title as next_pretty_title
  from public.resources as resources
  join resource_pretty_migration_ranked as ranked
    on ranked.resource_id = resources.id
  where coalesce(resources.pretty_title, '') <> ranked.pretty_title
)
update public.resource_pretty_titles as resource_pretty_titles
set is_current = false
from resource_pretty_migration_changed as changed
where resource_pretty_titles.resource_id = changed.resource_id
  and resource_pretty_titles.pretty_title <> changed.next_pretty_title
  and resource_pretty_titles.is_current = true;

with resource_pretty_migration_base as (
  select
    id as resource_id,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(lower(trim(name)), 'ä', 'ae'),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(id::text, 8)
    ) as base_slug
  from public.resources
), resource_pretty_migration_ranked as (
  select
    resource_id,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as pretty_title
  from resource_pretty_migration_base
), resource_pretty_migration_changed as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    ranked.pretty_title as next_pretty_title
  from public.resources as resources
  join resource_pretty_migration_ranked as ranked
    on ranked.resource_id = resources.id
  where coalesce(resources.pretty_title, '') <> ranked.pretty_title
)
update public.resources as resources
set pretty_title = changed.next_pretty_title
from resource_pretty_migration_changed as changed
where resources.id = changed.resource_id;

update public.resources
set map_features =
  case
    when map_features is null or jsonb_typeof(map_features) <> 'array'
      then jsonb_build_array(
        jsonb_build_object(
          'id', 'gps-point',
          'layer', 'location',
          'geometryType', 'Point',
          'point', jsonb_build_array(gps_longitude, gps_latitude)
        )
      )
    when not exists (
      select 1
      from jsonb_array_elements(map_features) as feature
      where feature ->> 'id' = 'gps-point'
    )
      then jsonb_build_array(
        jsonb_build_object(
          'id', 'gps-point',
          'layer', 'location',
          'geometryType', 'Point',
          'point', jsonb_build_array(gps_longitude, gps_latitude)
        )
      ) || map_features
    else map_features
  end
where gps_latitude is not null
  and gps_longitude is not null;

alter table public.resources drop column if exists related_resources;

alter table public.resources enable row level security;

drop policy if exists "Authenticated users can read resources" on public.resources;
drop policy if exists "Owners can insert resources" on public.resources;
drop policy if exists "Owners can update resources" on public.resources;
drop policy if exists "Owners can delete resources" on public.resources;

create policy "Authenticated users can read resources"
on public.resources
for select
using (auth.role() = 'authenticated');

create policy "Owners can insert resources"
on public.resources
for insert
with check (auth.uid() = owner_id and public.has_right('resources:create'));

create policy "Owners can update resources"
on public.resources
for update
using (owner_id = auth.uid() or public.has_right('resources:edit'))
with check (owner_id = auth.uid() or public.has_right('resources:edit'));

create policy "Owners can delete resources"
on public.resources
for delete
using (owner_id = auth.uid() or public.has_right('resources:delete'));

create table if not exists public.resource_links (
  resource_a uuid not null references public.resources (id) on delete cascade,
  resource_b uuid not null references public.resources (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint resource_links_pk primary key (resource_a, resource_b),
  constraint resource_links_order check (resource_a < resource_b)
);

alter table public.resource_links enable row level security;
alter table public.resource_pretty_titles enable row level security;

drop policy if exists "Authenticated users can read resource links" on public.resource_links;
drop policy if exists "Authorized users can insert resource links" on public.resource_links;
drop policy if exists "Authorized users can delete resource links" on public.resource_links;
drop policy if exists "Authenticated users can read resource pretty titles" on public.resource_pretty_titles;
drop policy if exists "Authorized users can insert resource pretty titles" on public.resource_pretty_titles;
drop policy if exists "Authorized users can update resource pretty titles" on public.resource_pretty_titles;
drop policy if exists "Authorized users can delete resource pretty titles" on public.resource_pretty_titles;

create policy "Authenticated users can read resource links"
on public.resource_links
for select
using (auth.role() = 'authenticated');

create policy "Authorized users can insert resource links"
on public.resource_links
for insert
with check (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where (r.id = resource_a or r.id = resource_b)
      and (r.owner_id = auth.uid() or public.has_right('resources:edit') or public.has_right('resources:create'))
  )
);

create policy "Authorized users can delete resource links"
on public.resource_links
for delete
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where (r.id = resource_a or r.id = resource_b)
      and (r.owner_id = auth.uid() or public.has_right('resources:edit') or public.has_right('resources:delete'))
  )
);

create policy "Authenticated users can read resource pretty titles"
on public.resource_pretty_titles
for select
using (auth.role() = 'authenticated');

create policy "Authorized users can insert resource pretty titles"
on public.resource_pretty_titles
for insert
with check (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and (r.owner_id = auth.uid() or public.has_right('resources:edit') or public.has_right('resources:create'))
  )
);

create policy "Authorized users can update resource pretty titles"
on public.resource_pretty_titles
for update
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and (r.owner_id = auth.uid() or public.has_right('resources:edit'))
  )
)
with check (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and (r.owner_id = auth.uid() or public.has_right('resources:edit'))
  )
);

create policy "Authorized users can delete resource pretty titles"
on public.resource_pretty_titles
for delete
using (
  auth.role() = 'authenticated'
  and exists (
    select 1
    from public.resources r
    where r.id = resource_id
      and (r.owner_id = auth.uid() or public.has_right('resources:edit') or public.has_right('resources:delete'))
  )
);

create index if not exists resource_links_resource_a_idx on public.resource_links (resource_a);
create index if not exists resource_links_resource_b_idx on public.resource_links (resource_b);

with pretty_title_normalization_base as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(
                      lower(
                        trim(
                          coalesce(
                            nullif(resources.pretty_title, ''),
                            resources.name,
                            'resource-' || left(resources.id::text, 8)
                          )
                        )
                      ),
                      'ä',
                      'ae'
                    ),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(resources.id::text, 8)
    ) as base_slug
  from public.resources as resources
), pretty_title_normalization_ranked as (
  select
    resource_id,
    previous_pretty_title,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as next_pretty_title
  from pretty_title_normalization_base
), pretty_title_normalization_changed as (
  select
    resource_id,
    previous_pretty_title,
    next_pretty_title
  from pretty_title_normalization_ranked
  where coalesce(previous_pretty_title, '') <> next_pretty_title
)
insert into public.resource_pretty_titles (resource_id, pretty_title, is_current)
select resource_id, previous_pretty_title, false
from pretty_title_normalization_changed
where previous_pretty_title is not null and previous_pretty_title <> ''
on conflict (resource_id, pretty_title)
do nothing;

with pretty_title_normalization_base as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(
                      lower(
                        trim(
                          coalesce(
                            nullif(resources.pretty_title, ''),
                            resources.name,
                            'resource-' || left(resources.id::text, 8)
                          )
                        )
                      ),
                      'ä',
                      'ae'
                    ),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(resources.id::text, 8)
    ) as base_slug
  from public.resources as resources
), pretty_title_normalization_ranked as (
  select
    resource_id,
    previous_pretty_title,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as next_pretty_title
  from pretty_title_normalization_base
), pretty_title_normalization_changed as (
  select
    resource_id,
    previous_pretty_title,
    next_pretty_title
  from pretty_title_normalization_ranked
  where coalesce(previous_pretty_title, '') <> next_pretty_title
)
insert into public.resource_pretty_titles (resource_id, pretty_title, is_current)
select resource_id, next_pretty_title, true
from pretty_title_normalization_changed
on conflict (resource_id, pretty_title)
do update set is_current = excluded.is_current;

with pretty_title_normalization_base as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(
                      lower(
                        trim(
                          coalesce(
                            nullif(resources.pretty_title, ''),
                            resources.name,
                            'resource-' || left(resources.id::text, 8)
                          )
                        )
                      ),
                      'ä',
                      'ae'
                    ),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(resources.id::text, 8)
    ) as base_slug
  from public.resources as resources
), pretty_title_normalization_ranked as (
  select
    resource_id,
    previous_pretty_title,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as next_pretty_title
  from pretty_title_normalization_base
), pretty_title_normalization_changed as (
  select
    resource_id,
    previous_pretty_title,
    next_pretty_title
  from pretty_title_normalization_ranked
  where coalesce(previous_pretty_title, '') <> next_pretty_title
)
update public.resource_pretty_titles as resource_pretty_titles
set is_current = false
from pretty_title_normalization_changed as changed
where resource_pretty_titles.resource_id = changed.resource_id
  and resource_pretty_titles.pretty_title <> changed.next_pretty_title
  and resource_pretty_titles.is_current = true;

with pretty_title_normalization_base as (
  select
    resources.id as resource_id,
    resources.pretty_title as previous_pretty_title,
    coalesce(
      nullif(
        trim(
          both '-'
          from regexp_replace(
            regexp_replace(
              replace(
                replace(
                  replace(
                    replace(
                      lower(
                        trim(
                          coalesce(
                            nullif(resources.pretty_title, ''),
                            resources.name,
                            'resource-' || left(resources.id::text, 8)
                          )
                        )
                      ),
                      'ä',
                      'ae'
                    ),
                    'ö',
                    'oe'
                  ),
                  'ü',
                  'ue'
                ),
                'ß',
                'ss'
              ),
              '[^a-z0-9]+',
              '-',
              'g'
            ),
            '-+',
            '-',
            'g'
          )
        ),
        ''
      ),
      'resource-' || left(resources.id::text, 8)
    ) as base_slug
  from public.resources as resources
), pretty_title_normalization_ranked as (
  select
    resource_id,
    previous_pretty_title,
    case
      when row_number() over (partition by base_slug order by resource_id) = 1
        then base_slug
      else base_slug || '-' || row_number() over (partition by base_slug order by resource_id)
    end as next_pretty_title
  from pretty_title_normalization_base
), pretty_title_normalization_changed as (
  select
    resource_id,
    previous_pretty_title,
    next_pretty_title
  from pretty_title_normalization_ranked
  where coalesce(previous_pretty_title, '') <> next_pretty_title
)
update public.resources as resources
set pretty_title = changed.next_pretty_title
from pretty_title_normalization_changed as changed
where resources.id = changed.resource_id;

update public.resource_pretty_titles as resource_pretty_titles
set is_current = resource_pretty_titles.pretty_title = resources.pretty_title
from public.resources as resources
where resources.id = resource_pretty_titles.resource_id;
