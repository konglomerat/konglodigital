-- Browser clients have no direct access. All operations go through admin-gated
-- routes or the separately authenticated worker. Camera/files stay private.
create table public.printer_automation_templates (
  id uuid primary key default gen_random_uuid(),
  printer_id text not null,
  name text not null check (char_length(name) between 1 and 120),
  file_name text not null,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  model text not null,
  plate integer not null check (plate between 1 and 100),
  use_ams boolean not null default false,
  ams_mapping integer[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.printer_automations (
  printer_id text primary key,
  template_id uuid references public.printer_automation_templates(id),
  mode text not null default 'off' check (mode in ('off','observe','armed')),
  phase text not null default 'watching' check (phase in ('watching','awaiting_start','printing','blocked')),
  remaining_runs integer not null default 1 check (remaining_runs between 0 and 100),
  authorized_by uuid references auth.users(id) on delete set null,
  revision bigint not null default 1,
  idle_since timestamptz,
  last_observed_at timestamptz,
  clear_since timestamptz,
  last_image_hash text,
  last_image_at timestamptz,
  last_verdict jsonb,
  last_message text not null default 'Ausgeschaltet',
  last_run_id uuid,
  dispatched_at timestamptz,
  checked_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now()
);
create table public.printer_automation_runs (
  id uuid primary key,
  printer_id text not null references public.printer_automations(printer_id),
  template_id uuid not null references public.printer_automation_templates(id),
  state text not null check (state in ('dispatching','accepted','printing','completed','rejected','unknown')),
  message text not null,
  created_at timestamptz not null default now()
);
create index printer_automation_runs_created_at_idx on public.printer_automation_runs(created_at desc);
alter table public.printer_automation_templates enable row level security;
alter table public.printer_automations enable row level security;
alter table public.printer_automation_runs enable row level security;
revoke all on public.printer_automation_templates, public.printer_automations, public.printer_automation_runs from anon, authenticated;
grant all on public.printer_automation_templates, public.printer_automations, public.printer_automation_runs to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
values ('printer-automation', 'printer-automation', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

-- Also protect against pre-existing broad storage policies in an installation.
create policy "Printer automation storage is server only" on storage.objects
as restrictive for all to anon, authenticated
using (bucket_id <> 'printer-automation')
with check (bucket_id <> 'printer-automation');

create function public.claim_printer_automation(p_printer text, p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare claimed public.printer_automations;
begin
  update public.printer_automations set lease_token = p_token,
    lease_until = now() + interval '120 seconds', checked_at = now()
  where printer_id = p_printer and mode <> 'off'
    and (lease_until is null or lease_until < now())
  returning * into claimed;
  return to_jsonb(claimed);
end $$;

create function public.configure_printer_automation(p_printer text, p_template uuid, p_mode text,
  p_runs integer, p_user uuid, p_acknowledge boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.printer_automations;
begin
  -- Serialize inserts and updates, including two concurrent first-time requests.
  perform pg_advisory_xact_lock(hashtextextended(p_printer, 0));
  select * into current_row from public.printer_automations where printer_id = p_printer for update;
  if p_mode <> 'off' then
    if current_row.phase in ('awaiting_start','printing','blocked') and not p_acknowledge then
      raise exception 'Previous dispatch must be checked before rearming';
    end if;
    if not exists(select 1 from public.printer_automation_templates where id = p_template and printer_id = p_printer) then
      raise exception 'Template does not belong to printer';
    end if;
  end if;
  insert into public.printer_automations(printer_id, template_id, mode, remaining_runs, authorized_by, last_message)
  values (p_printer, p_template, p_mode, p_runs, p_user, case when p_mode = 'off' then 'Ausgeschaltet' else 'Warte auf aktuelle Druckerdaten' end)
  on conflict (printer_id) do update set template_id = excluded.template_id, mode = excluded.mode,
    remaining_runs = excluded.remaining_runs, authorized_by = p_user,
    revision = public.printer_automations.revision + 1,
    phase = case when p_mode = 'off' then public.printer_automations.phase else 'watching' end,
    idle_since = null, last_observed_at = null, clear_since = null, last_verdict = null,
    last_image_hash = null, last_image_at = null,
    lease_token = null, lease_until = null, last_message = excluded.last_message, updated_at = now();
end $$;

create function public.reserve_printer_automation_run(p_printer text, p_token uuid, p_revision bigint, p_run uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare current_row public.printer_automations;
begin
  select * into current_row from public.printer_automations where printer_id = p_printer for update;
  if current_row is null or current_row.lease_token is distinct from p_token
    or current_row.lease_until is null or current_row.lease_until <= now() or current_row.revision <> p_revision
    or current_row.mode <> 'armed' or current_row.phase <> 'watching' or current_row.remaining_runs < 1 then
    return false;
  end if;
  insert into public.printer_automation_runs(id, printer_id, template_id, state, message)
    values (p_run, p_printer, current_row.template_id, 'dispatching', 'Start reserviert; Rückmeldung wird erwartet.');
  -- Durable intent BEFORE the external action. A crash never causes a resend.
  update public.printer_automations set phase = 'awaiting_start', last_run_id = p_run,
    dispatched_at = now(), remaining_runs = remaining_runs - 1, idle_since = null, clear_since = null,
    last_message = 'Start reserviert; Rückmeldung wird erwartet.', updated_at = now()
    where printer_id = p_printer;
  return true;
end $$;

revoke all on function public.claim_printer_automation(text,uuid),
  public.configure_printer_automation(text,uuid,text,integer,uuid,boolean),
  public.reserve_printer_automation_run(text,uuid,bigint,uuid) from public, anon, authenticated;
grant execute on function public.claim_printer_automation(text,uuid),
  public.configure_printer_automation(text,uuid,text,integer,uuid,boolean),
  public.reserve_printer_automation_run(text,uuid,bigint,uuid) to service_role;
