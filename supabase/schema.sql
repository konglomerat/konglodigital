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
