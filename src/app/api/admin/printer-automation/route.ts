import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterMetadataCached, fetchPrintersFromCloud } from "@/lib/bambu-cloud";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { getBridgeHealth } from "@/lib/printer-automation/bridge";
import { isFreshIdle } from "@/lib/printer-automation/decision";
import { loadAutomationData } from "@/lib/printer-automation/store";
import { readLimitedBody } from "@/lib/printer-automation/templates";
import type { AutomationOverview } from "@/lib/printer-automation/types";

import { DEFAULT_MATERIAL, parseMaterialRequirement } from "@/lib/printer-automation/material";

export const runtime = "nodejs";

export const GET = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const [stored, status, bridge] = await Promise.allSettled([loadAutomationData(), fetchPrintersFromCloud(), getBridgeHealth()]);
  const data = stored.status === "fulfilled" ? stored.value : { automations: [], templates: [], runs: [] };
  // A missing automation migration must not hide the independent printer status.
  const printers: AutomationOverview["printers"] = status.status === "fulfilled" ? status.value.map(({ serial, ...printer }) => {
    void serial;
    return printer;
  }) : (await fetchPrinterMetadataCached().catch(() => [])).map(({ id, name, model }) => ({
    id, name, model, status: "unknown", progress: 0, statusSource: "unavailable", statusStale: true,
    updatedAt: new Date().toISOString(),
  }));
  return NextResponse.json({ ...data, templates: data.templates.map(template => {
    const { storage_path, ...publicTemplate } = template;
    void storage_path;
    return publicTemplate;
  }), printers, fetchedAt: new Date().toISOString(),
  storage: { available: stored.status === "fulfilled", message: stored.status === "fulfilled" ? null
    : "Gespeicherte Dauerschleifen sind nicht verfügbar. Datenbank-Einrichtung und Verbindung prüfen." },
  printerStatus: { available: status.status === "fulfilled", message: status.status === "fulfilled" ? null
    : "Druckerstatus konnte nicht von Bambu geladen werden. Erneut aktualisieren." },
  bridge: bridge.status === "fulfilled" ? bridge.value : { connected: false, printers: [], message: "Drucker-Dienst nicht erreichbar." },
  liveEnabled: process.env.PRINTER_AUTOMATION_LIVE_ENABLED === "true" } satisfies AutomationOverview);
});

export const PUT = (request: NextRequest) => adminAutomationRequest(request, async userId => {
  const body = JSON.parse((await readLimitedBody(request.body, 8192)).toString());
  const { printerId, templateId, mode, runs, acknowledge } = body;
  if (typeof printerId !== "string" || !["off", "observe", "armed"].includes(mode)
    || !Number.isInteger(runs) || runs < 1 || runs > 100
    || (templateId !== null && (typeof templateId !== "string" || !/^[a-f0-9-]{36}$/i.test(templateId)))) {
    throw new AutomationError("Ungültige Einstellungen.");
  }
  let material;
  try { material = parseMaterialRequirement(body.material ?? DEFAULT_MATERIAL); }
  catch { throw new AutomationError("Material, Farbe, Düse oder Zuführung sind ungültig."); }
  const printers = await fetchPrinterMetadataCached();
  if (!printers.some(p => p.id === printerId)) throw new AutomationError("Drucker nicht gefunden.", 404);
  const db = createSupabaseAdminClient();
  const { data: current, error } = await db.from("printer_automations").select("phase").eq("printer_id", printerId).maybeSingle();
  if (error) throw error;
  if (mode !== "off" && current && current.phase !== "watching") {
    if (acknowledge !== true) throw new AutomationError("Bitte zuerst das Ergebnis des letzten Starts am Drucker prüfen.", 409);
    const printer = (await fetchPrintersFromCloud()).find(p => p.id === printerId);
    if (!isFreshIdle(printer, Date.now())) throw new AutomationError("Der Drucker muss aktuell im Leerlauf sein, bevor die Sperre aufgehoben werden kann.", 409);
  }
  if (mode === "armed") {
    const bridge = await getBridgeHealth();
    if (process.env.PRINTER_AUTOMATION_LIVE_ENABLED !== "true" || !bridge.printers.some(p => p.id === printerId && p.camera && p.canStart)) {
      throw new AutomationError("Echtbetrieb ist noch nicht verfügbar. Kamera- und Druckanbindung müssen eingerichtet und freigegeben sein.", 409);
    }
  }
  const result = await db.rpc("configure_printer_automation", { p_printer: printerId, p_template: templateId,
    p_mode: mode, p_runs: runs, p_user: userId, p_acknowledge: acknowledge === true, p_material: material });
  if (result.error) throw new AutomationError("Einstellungen konnten nicht gespeichert werden. Vorlage und letzte Startfreigabe prüfen.", 409);
  return NextResponse.json({ ok: true });
});
