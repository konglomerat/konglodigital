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
