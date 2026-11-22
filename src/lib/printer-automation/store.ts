import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AutomationError } from "./auth";
import type { Automation, AutomationRun, PrintTemplate } from "./types";

export async function loadAutomationData() {
  const db = createSupabaseAdminClient();
  const [automations, templates, runs] = await Promise.all([
    db.from("printer_automations").select("*").order("printer_id"),
    db.from("printer_automation_templates").select("*").order("created_at", { ascending: false }),
    db.from("printer_automation_runs").select("*").order("created_at", { ascending: false }).limit(30),
  ]);
  for (const result of [automations, templates, runs]) {
    if (result.error) throw new AutomationError("Die Druckautomatik ist noch nicht eingerichtet. Datenbankmigration prüfen.", 503);
  }
  return { automations: automations.data as Automation[], templates: templates.data as PrintTemplate[], runs: runs.data as AutomationRun[] };
}
