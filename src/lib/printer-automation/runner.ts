import { randomUUID } from "node:crypto";
import { fetchPrintersFromCloud } from "@/lib/bambu-cloud";
import type { BambuPrinter } from "@/lib/bambu";
import { getUserRoles } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { capturePrinterImage, dispatchPrint, getBridgeHealth } from "./bridge";
import { confirmClearBed, isFreshIdle, isFreshPrinterState, normalizePrinterModel, observeIdle } from "./decision";
import { inspectPrinterBed } from "./vision";
import { AUTOMATION_BUCKET, MAX_IMAGE_AGE_MS, type Automation, type PrintTemplate } from "./types";

import { DEFAULT_MATERIAL, parseMaterialRequirement, selectMaterial } from "./material";
import { validatePrintMaterial } from "./templates";

export async function runAutomationTick() {
  const db = createSupabaseAdminClient();
  const { data: active, error } = await db.from("printer_automations").select("printer_id").neq("mode", "off");
  if (error) throw new Error("Automation database unavailable");
  if (!active?.length) return [];
  // Fetch live status once per tick; never rely on browser polling.
  const [printers, bridge] = await Promise.all([fetchPrintersFromCloud().catch(() => [] as BambuPrinter[]), getBridgeHealth()]);
  const results = await Promise.allSettled(active.map(async ({ printer_id: printerId }) => {
    const token = randomUUID();
    const { data, error: claimError } = await db.rpc("claim_printer_automation", { p_printer: printerId, p_token: token });
    if (claimError) throw new Error("Automation claim failed");
    if (!data?.printer_id) return { printerId, result: "busy" };
    const automation = data as Automation;
    const save = async (patch: Partial<Automation>) => {
      const { data: changed, error: saveError } = await db.from("printer_automations")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("printer_id", printerId).eq("lease_token", token).eq("revision", automation.revision)
        .gt("lease_until", new Date().toISOString()).select("printer_id");
      if (saveError) throw new Error("Automation state could not be saved");
      return Boolean(changed?.length);
    };
    const updateRun = async (state: string, message: string, runId = automation.last_run_id) => {
      if (runId) {
        const { error: runError } = await db.from("printer_automation_runs").update({ state, message }).eq("id", runId);
        if (runError) throw new Error("Run receipt could not be saved");
      }
    };
    let dispatchReserved = false;
    let reservedId: string | undefined;
    try {
      const printer = printers.find(p => p.id === printerId);
      const now = Date.now();
      if (automation.phase === "blocked") {
        await save({ mode: "off", idle_since: null, clear_since: null });
        return { printerId, result: "blocked" };
      }
      if (automation.phase === "awaiting_start" || automation.phase === "printing") {
        const fresh = isFreshPrinterState(printer, now);
        const expectedJob = Boolean(automation.last_run_id && printer?.jobName?.includes(automation.last_run_id));
        if (fresh && printer?.status === "printing" && expectedJob) {
          await updateRun("printing", "Drucker bestätigt den gestarteten Auftrag.");
          await save({ phase: "printing", last_message: "Folgedruck läuft. Weitere Starts warten auf dessen Abschluss." });
        } else if (automation.phase === "printing" && isFreshIdle(printer, now)) {
          await updateRun("completed", "Druck beendet; vor dem nächsten Druck muss das Bett erneut frei sein.");
          await save({ phase: "watching", mode: automation.remaining_runs > 0 ? automation.mode : "off",
            idle_since: null, clear_since: null, last_verdict: null, last_image_hash: null,
            last_observed_at: null, last_message: automation.remaining_runs > 0 ? "Druck beendet. Warte auf 15 Minuten Leerlauf und ein freies Bett." : "Alle freigegebenen Drucke sind abgeschlossen." });
        } else if ((fresh && printer && ["error", "paused"].includes(printer.status))
          || (fresh && printer?.status === "printing" && !expectedJob)
          || (automation.phase === "awaiting_start" && now - Date.parse(automation.dispatched_at ?? "") > 180_000)) {
          await updateRun("unknown", "Auftrag konnte nicht eindeutig bestätigt werden. Vor erneutem Aktivieren am Drucker prüfen.");
          await save({ mode: "off", phase: "blocked", last_message: "Druckstart oder Druckverlauf unklar. Bitte den Drucker und das letzte Ergebnis prüfen." });
        }
        return { printerId, result: "monitoring-dispatch" };
      }

      const { data: owner } = automation.authorized_by
        ? await db.auth.admin.getUserById(automation.authorized_by) : { data: { user: null } };
      if (!owner.user || !(await getUserRoles(db, owner.user)).includes("admin")) {
        await save({ mode: "off", idle_since: null, clear_since: null, last_message: "Die Admin-Freigabe ist nicht mehr gültig." });
        return { printerId, result: "authorization-revoked" };
      }
      const idle = observeIdle(automation, printer, now);
      if (!idle.ready) {
        await save({ idle_since: idle.idleSince, last_observed_at: isFreshIdle(printer, now) ? printer!.statusObservedAt! : null,
          clear_since: null, last_verdict: null,
          last_message: idle.idleSince ? "Warte auf 15 Minuten durchgehend beobachteten Leerlauf." : "Warte auf einen aktuellen, fehlerfreien Leerlaufstatus." });
        return { printerId, result: "waiting" };
      }
      const requirement = parseMaterialRequirement(automation.material_requirement ?? DEFAULT_MATERIAL);
      const material = selectMaterial(printer?.materialInventory, requirement, Date.now());
      if (!material.ready) {
        await save({ clear_since: null, last_verdict: null, last_observed_at: printer!.statusObservedAt!, last_message: material.message });
        return { printerId, result: "material-unavailable" };
      }
      const capability = bridge.printers.find(p => p.id === printerId);
      if (!bridge.connected || !capability?.camera) {
        await save({ clear_since: null, last_verdict: null, last_observed_at: printer!.statusObservedAt!, last_message: "Kamera-Verbindung fehlt. Kein Start möglich." });
        return { printerId, result: "camera-unavailable" };
      }
      const image = await capturePrinterImage(printerId);
      const verdict = await inspectPrinterBed(image.jpeg);
      const clear = confirmClearBed(automation, verdict, image, Date.now());
      const saved = await save({ idle_since: idle.idleSince, last_observed_at: printer!.statusObservedAt!,
        clear_since: clear.clearSince, last_image_hash: image.hash, last_image_at: image.capturedAt, last_verdict: verdict,
        last_message: clear.ready ? "Druckbett zweimal als frei erkannt." : clear.clearSince ? "Erstes freies Bild. Warte auf eine zweite aktuelle Aufnahme." : verdict.reason });
      if (!saved || !clear.ready) return { printerId, result: "checked" };
      const { data: templateData, error: templateError } = await db.from("printer_automation_templates").select("*").eq("id", automation.template_id).single();
      if (templateError || !templateData) throw new Error("Template missing");
      const template = templateData as PrintTemplate;
      if (template.printer_id !== printerId || normalizePrinterModel(template.model) !== normalizePrinterModel(printer!.model)) throw new Error("Printer model mismatch");
      const { data: file, error: fileError } = await db.storage.from(AUTOMATION_BUCKET).download(template.storage_path);
      if (fileError || !file) throw new Error("Template download failed");
      const bytes = Buffer.from(await file.arrayBuffer());
      // Status may have changed during camera/vision/file IO. Fetch it again.
      const finalPrinter = (await fetchPrintersFromCloud()).find(p => p.id === printerId);
      if (!isFreshIdle(finalPrinter, Date.now()) || Date.now() - Date.parse(image.capturedAt) > MAX_IMAGE_AGE_MS) {
        await save({ idle_since: null, clear_since: null, last_message: "Status oder Bild ist nicht mehr aktuell. Prüfung beginnt erneut." });
        return { printerId, result: "recheck-failed" };
      }
      const finalMaterial = selectMaterial(finalPrinter?.materialInventory, requirement, Date.now());
      const materialError = finalMaterial.slot
        ? validatePrintMaterial(bytes, template.file_name, template.model, template.plate, requirement, finalMaterial.slot)
        : finalMaterial.message;
      if (!finalMaterial.ready || materialError) {
        await save({ clear_since: null, last_message: materialError ?? finalMaterial.message });
        return { printerId, result: "material-recheck-failed" };
      }
      if (automation.mode === "observe") {
        await save({ last_message: "Test erfolgreich: Die Bedingungen für einen Start sind erfüllt. Testbetrieb startet keinen Druck." });
        return { printerId, result: "would-start" };
      }
      if (process.env.PRINTER_AUTOMATION_LIVE_ENABLED !== "true" || !capability.canStart) {
        await save({ mode: "off", clear_since: null, last_message: "Automatischer Druckstart ist auf dem Server noch nicht freigegeben." });
        return { printerId, result: "start-unavailable" };
      }
      const runId = randomUUID();
      const { data: reserved, error: reserveError } = await db.rpc("reserve_printer_automation_run", {
        p_printer: printerId, p_token: token, p_revision: automation.revision, p_run: runId,
      });
      if (reserveError) throw new Error("Dispatch reservation failed");
      if (!reserved) return { printerId, result: "configuration-changed" };
      dispatchReserved = true;
      reservedId = runId;
      const receipt = await dispatchPrint(runId, template, bytes, image.capturedAt, { requirement, slot: finalMaterial.slot!, observedAt: finalPrinter!.materialInventory!.observedAt });
      const message = receipt === "accepted" ? "Start übermittelt. Warte auf Bestätigung des Auftrags durch den Drucker."
        : receipt === "rejected" ? "Drucker hat den Start abgelehnt. Einrichtung prüfen." : "Rückmeldung zum Druckstart unklar. Kein automatischer Wiederholungsversuch.";
      await updateRun(receipt, message, runId);
      await save({ last_message: message, ...(receipt === "accepted" ? {} : { mode: "off", phase: "blocked" }) });
      return { printerId, result: receipt };
    } catch {
      await save({ clear_since: null, last_verdict: null,
        ...(dispatchReserved ? { mode: "off", phase: "blocked" } : { idle_since: null, last_observed_at: null }),
        last_message: dispatchReserved ? "Druckstart unklar. Vor erneutem Aktivieren am Drucker prüfen." : "Prüfung fehlgeschlagen. Kein Druckstart; Leerlaufprüfung beginnt erneut." });
      if (dispatchReserved) await updateRun("unknown", "Verbindung nach Startreservierung unterbrochen. Nicht automatisch erneut senden.", reservedId);
      return { printerId, result: "failed" };
    } finally {
      await db.from("printer_automations").update({ lease_token: null, lease_until: null }).eq("printer_id", printerId).eq("lease_token", token);
    }
  }));
  return results.map(r => r.status === "fulfilled" ? r.value : { result: "failed" });
}
