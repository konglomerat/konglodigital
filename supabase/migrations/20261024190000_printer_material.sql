-- Material policy is saved atomically with the configuration revision/lease reset.
alter table public.printer_automations add column material_requirement jsonb not null
  default '{"type":"PETG","color":"000000","nozzle":0.4,"source":"auto"}'::jsonb
  check (coalesce(jsonb_typeof(material_requirement) = 'object'
    and material_requirement ?& array['type','color','nozzle','source']
    and material_requirement->>'type' in ('PETG','PLA','ABS','ASA','TPU','TPU-AMS','PA','PC')
    and material_requirement->>'color' ~ '^[0-9A-F]{6}$'
    and jsonb_typeof(material_requirement->'nozzle') = 'number'
    and material_requirement->>'nozzle' in ('0.2','0.4','0.6','0.8')
    and material_requirement->>'source' in ('auto','ams','external'), false));
drop function public.configure_printer_automation(text,uuid,text,integer,uuid,boolean);
create function public.configure_printer_automation(p_printer text, p_template uuid, p_mode text,
  p_runs integer, p_user uuid, p_acknowledge boolean default false, p_material jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare current_row public.printer_automations; required_material jsonb;
begin
  -- Serialize inserts and updates, including two concurrent first-time requests.
  perform pg_advisory_xact_lock(hashtextextended(p_printer, 0));
  select * into current_row from public.printer_automations where printer_id = p_printer for update;
  required_material := coalesce(p_material, current_row.material_requirement, '{"type":"PETG","color":"000000","nozzle":0.4,"source":"auto"}'::jsonb);
  if p_mode <> 'off' then
    if current_row.phase in ('awaiting_start','printing','blocked') and not p_acknowledge then
      raise exception 'Previous dispatch must be checked before rearming';
    end if;
    if not exists(select 1 from public.printer_automation_templates where id = p_template and printer_id = p_printer) then
      raise exception 'Template does not belong to printer';
    end if;
  end if;
  insert into public.printer_automations(printer_id, template_id, mode, remaining_runs, authorized_by, last_message, material_requirement)
  values (p_printer, p_template, p_mode, p_runs, p_user, case when p_mode = 'off' then 'Ausgeschaltet' else 'Warte auf aktuelle Druckerdaten' end, required_material)
  on conflict (printer_id) do update set template_id = excluded.template_id, mode = excluded.mode,
    material_requirement = excluded.material_requirement, remaining_runs = excluded.remaining_runs, authorized_by = p_user,
    revision = public.printer_automations.revision + 1,
    phase = case when p_mode = 'off' then public.printer_automations.phase else 'watching' end,
    idle_since = null, last_observed_at = null, clear_since = null, last_verdict = null,
    last_image_hash = null, last_image_at = null,
    lease_token = null, lease_until = null, last_message = excluded.last_message, updated_at = now();
end $$;

revoke all on function public.configure_printer_automation(text,uuid,text,integer,uuid,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.configure_printer_automation(text,uuid,text,integer,uuid,boolean,jsonb) to service_role;
