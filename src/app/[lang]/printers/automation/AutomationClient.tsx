"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Button from "@/components/knglmrt/Button";
import PageTitle from "../../components/PageTitle";
import type { Automation, AutomationOverview } from "@/lib/printer-automation/types";
import { currentPrint, loopPhase, printerStatusLabels } from "@/lib/printer-automation/presentation";
import { automationApi as api } from "./api";
import LastPhoto from "./LastPhoto";
import PrinterHistory from "./PrinterHistory";

import { DEFAULT_MATERIAL, MATERIAL_TYPES, selectMaterial, type MaterialRequirement } from "@/lib/printer-automation/material";

const field = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-foreground";
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString("de-DE") : "Noch keine Prüfung";
const statusStyles = { idle: "bg-success-soft text-success", printing: "bg-primary/10 text-primary", paused: "bg-warning-soft text-warning", offline: "bg-muted text-muted-foreground", error: "bg-destructive-soft text-destructive", unknown: "bg-muted text-muted-foreground" };
const runLabels = { dispatching: "Start reserviert", accepted: "Start übermittelt", printing: "Druck läuft", completed: "Abgeschlossen", rejected: "Abgelehnt", unknown: "Ergebnis unklar" };

function PrinterCard({ printer, automation, overview, refresh, now }: {
  printer: AutomationOverview["printers"][number]; automation?: Automation;
  overview: AutomationOverview; refresh: () => Promise<void>; now: number;
}) {
  const templates = overview.templates.filter(t => t.printer_id === printer.id);
  const [selectedTemplateId, setTemplateId] = useState<string | null>(null);
  const templateId = selectedTemplateId ?? automation?.template_id ?? "";
  const savedTemplate = templates.find(t => t.id === automation?.template_id);
  const activity = currentPrint(printer, automation, now);
  const [editedMaterial, setMaterial] = useState<MaterialRequirement | null>(null);
  const material = editedMaterial ?? automation?.material_requirement ?? DEFAULT_MATERIAL;
  const savedMaterial = automation?.material_requirement ?? DEFAULT_MATERIAL;
  const match = selectMaterial(printer.materialInventory, savedMaterial, now);
  const preview = selectMaterial(printer.materialInventory, material, now);
  const [runs, setRuns] = useState(1);
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const capability = overview.bridge.printers.find(p => p.id === printer.id);
  const needsReview = Boolean(automation && automation.phase !== "watching");
  const canArm = overview.storage.available && overview.liveEnabled && capability?.canStart && capability.camera;
  const configure = async (mode: Automation["mode"], materialOnly = false) => {
    setBusy(true); setMessage("");
    try {
      await api("", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        printerId: printer.id, templateId: templateId || null, mode, runs, acknowledge, material,
      }) });
      setAcknowledge(false);
      await refresh();
      setMessage(materialOnly ? "Materialvorgabe gespeichert." : mode === "off" ? "Automatik ausgeschaltet. Ein bereits übermittelter Druck läuft weiter." : "Gespeichert. Die Leerlaufprüfung beginnt jetzt neu.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  return <section aria-label={printer.name} className="knglmrt-border min-w-0 rounded-lg bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">{printer.name}</h2><p className="text-sm text-muted-foreground">{printer.model}</p></div>
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${activity.stale ? statusStyles.unknown : statusStyles[printer.status]}`}>
        {activity.stale ? "Zuletzt: " : ""}{printerStatusLabels[printer.status]}
      </span>
    </div>
    <div className="mt-5 rounded-md border border-border p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{activity.stale ? "Zuletzt gemeldeter Auftrag" : printer.status === "error" ? "Auftrag mit Fehlermeldung" : "Aktueller Druck"}</h3>
      <p className="mt-2 break-words text-lg font-bold">{printer.jobName || (activity.active ? "Auftragsname nicht gemeldet" : printer.status === "idle" ? "Kein Druck aktiv" : "Kein laufender Auftrag bestätigt")}</p>
      {activity.active && <>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
          <span>{activity.progress} %</span>
          {printer.remainingMinutes !== undefined && <span>Restzeit: ca. {printer.remainingMinutes >= 60 ? `${Math.floor(printer.remainingMinutes / 60)} Std. ${printer.remainingMinutes % 60} Min.` : `${printer.remainingMinutes} Min.`}</span>}
        </div>
        <progress aria-label="Druckfortschritt" value={activity.progress} max={100} className="mt-2 h-2 w-full accent-primary" />
        {!!printer.totalLayers && <p className="mt-2 text-sm text-muted-foreground">Schicht {printer.currentLayer ?? "–"} / {printer.totalLayers}</p>}
        <p className="mt-2 text-sm">{activity.fromLoop ? "Dieser Auftrag stammt aus der Dauerschleife." : "Keine bestätigte Zuordnung zur Dauerschleife."}</p>
      </>}
      {printer.statusDetail && <p className={`mt-2 text-sm ${printer.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{printer.statusDetail}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        {printer.statusSource === "unavailable" ? "Status nicht verfügbar" : activity.stale ? "Veralteter Status" : printer.liveStateConfirmed ? "Live vom Drucker" : "Cloud-Status · nicht live bestätigt"}
        {printer.statusObservedAt && <> · {timestamp(printer.statusObservedAt)}</>}
      </p>
    </div>
    <LastPhoto printerId={printer.id} name={printer.name} refreshedAt={overview.fetchedAt} canCapture={overview.bridge.connected && Boolean(capability?.camera)} now={now} />
    <div className="mt-4 rounded-md bg-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Dauerschleife</h3>
        <span className="text-sm">{loopPhase(automation, overview.storage.available)}</span>
      </div>
      <p className="mt-2 break-words text-lg font-bold">{!overview.storage.available ? "Vorlage nicht abrufbar" : savedTemplate?.name ?? (automation?.template_id ? "Vorlage nicht verfügbar" : "Keine Vorlage hinterlegt")}</p>
      {savedTemplate && <p className="mt-1 break-words text-sm text-muted-foreground">{savedTemplate.file_name} · Platte {savedTemplate.plate}</p>}
      {automation?.mode === "armed" && <p className="mt-2 text-sm font-semibold">Noch {automation.remaining_runs} Druckstarts freigegeben</p>}
      {automation?.mode === "off" && activity.fromLoop && <p className="mt-2 text-sm">Der laufende Druck wird beendet. Weitere Wiederholungen sind ausgeschaltet.</p>}
      <p className="mt-2 text-sm" aria-live="polite">{overview.storage.available ? automation?.last_message || "Vorlage auswählen und eine Druckserie einrichten." : "Die gespeicherte Konfiguration konnte nicht geladen werden."}</p>
      <p className="mt-2 text-xs text-muted-foreground">Vor jedem neuen Start: 15 Minuten Leerlauf und ein als frei erkanntes Druckbett.</p>
    </div>
    <div className="mt-3 rounded-md border border-border p-4 text-sm">
      <h3 className="font-bold">Material für die Dauerschleife</h3>
      <p className="mt-2 flex items-center gap-2"><span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border border-border" style={{ backgroundColor: `#${savedMaterial.color}` }} />
        {savedMaterial.type} · {savedMaterial.color === "000000" ? "Schwarz" : `#${savedMaterial.color}`} · Düse {savedMaterial.nozzle.toLocaleString("de-DE")} mm
      </p>
      <p className={`mt-2 ${match.ready ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>{match.ready ? "Passende Zuführung: " : "Wartet: "}{match.message}</p>
      <p className="mt-2 text-xs text-muted-foreground">{savedMaterial.source === "auto" ? "AMS bevorzugt, sonst eingelegte externe Spule." : savedMaterial.source === "ams" ? "Nur AMS." : "Nur eingelegte externe Spule."} Wird vor jedem Start neu geprüft. Die Druckdatei muss zum Filamentprofil und zur Düse passen.</p>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
      <div><dt>Letzte Automatikprüfung</dt><dd>{overview.storage.available ? timestamp(automation?.checked_at ?? null) : "Nicht abrufbar"}</dd></div>
      <div><dt>Leerlauf seit</dt><dd>{!overview.storage.available ? "Nicht abrufbar" : automation?.idle_since ? timestamp(automation.idle_since) : automation?.mode && automation.mode !== "off" ? "Wird noch ermittelt" : "Prüfung nicht aktiv"}</dd></div>
    </dl>
    {automation && automation.mode !== "off" && (!automation.checked_at || now - Date.parse(automation.checked_at) > 180_000) &&
      <p className="mt-3 text-sm text-warning">Die Hintergrundprüfung ist überfällig. Der Zeitlauf wird bei Wiederaufnahme neu geprüft.</p>}
    {automation?.last_verdict && <p className="mt-3 rounded-md bg-muted p-3 text-sm">
      Letzte Bildprüfung: {automation.last_verdict.state === "empty" ? "frei erkannt" : automation.last_verdict.state === "occupied" ? "belegt" : "unklar"} — {automation.last_verdict.reason}
    </p>}
    <PrinterHistory printerId={printer.id} storageAvailable={overview.storage.available} onTemplate={async id => { setTemplateId(id); await refresh(); }} />
    <details className="mt-5 border-t border-border pt-4">
    <summary className="cursor-pointer text-sm font-bold">Dauerschleife einrichten / ändern</summary>
    <fieldset disabled={busy || !overview.storage.available} className="mt-4">
    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
      <label className="text-sm font-semibold">Druckvorlage
        <select className={field} value={templateId} onChange={e => setTemplateId(e.target.value)} disabled={busy}>
          <option value="">Vorlage auswählen</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name} · Platte {t.plate}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Druckanzahl
        <input type="number" min={1} max={100} className={field} value={runs} onChange={e => setRuns(Number(e.target.value))} disabled={busy} />
      </label>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Material<select className={field} value={material.type} onChange={e => setMaterial({ ...material, type: e.target.value })}>
        {MATERIAL_TYPES.map(type => <option key={type}>{type}</option>)}
      </select></label>
      <label className="text-sm font-semibold">Farbe<input type="color" className={`${field} h-11`} value={`#${material.color}`} onChange={e => setMaterial({ ...material, color: e.target.value.slice(1).toUpperCase() })} /></label>
      <label className="text-sm font-semibold">Düse<select className={field} value={material.nozzle} onChange={e => setMaterial({ ...material, nozzle: Number(e.target.value) })}>
        {[0.2, 0.4, 0.6, 0.8].map(n => <option key={n} value={n}>{n.toLocaleString("de-DE")} mm</option>)}
      </select></label>
      <label className="text-sm font-semibold">Zuführung<select className={field} value={material.source} onChange={e => setMaterial({ ...material, source: e.target.value as MaterialRequirement["source"] })}>
        <option value="auto">Automatisch: AMS oder externe Spule</option><option value="ams">Nur AMS</option><option value="external">Nur externe Spule</option>
      </select></label>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">Vorschau: {preview.message}</p>
    {(!automation || automation.mode === "off") && <div className="mt-3"><Button onClick={() => configure("off", true)} disabled={busy}>Materialvorgabe speichern</Button></div>}
    {automation?.mode === "armed" && <p className="mt-2 text-sm text-muted-foreground">Noch freigegeben: {automation.remaining_runs} Drucke. Nach jedem Druck muss das Bett erneut freigeräumt werden.</p>}
    {needsReview && <label className="mt-4 flex items-start gap-2 text-sm">
      <input type="checkbox" checked={acknowledge} onChange={e => setAcknowledge(e.target.checked)} className="mt-1" />
      Ich habe den letzten Start am Drucker geprüft. Es läuft kein Auftrag mehr; die Automatik darf neu eingerichtet werden.
    </label>}
    {!canArm && <p className="mt-4 text-sm text-muted-foreground">Echtbetrieb ist noch gesperrt. Die Verbindung für Kamera und Druckstart muss eingerichtet und auf dem Server freigegeben sein.</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={() => configure("observe")} disabled={busy || !templateId || (needsReview && !acknowledge)}>Testbetrieb speichern</Button>
      <Button kind="primary" onClick={() => configure("armed")} disabled={busy || !canArm || !templateId || (needsReview && !acknowledge)}>Automatik aktivieren</Button>
      <Button kind="danger-secondary" onClick={() => configure("off")} disabled={busy || !automation || automation.mode === "off"}>Ausschalten</Button>
    </div>
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </fieldset>
    </details>
  </section>;
}

export default function AutomationClient() {
  const [overview, setOverview] = useState<AutomationOverview | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef<Promise<void> | null>(null);
  const refresh = useCallback((): Promise<void> => {
    if (pending.current) return pending.current;
    setRefreshing(true);
    pending.current = (async () => {
      try { setOverview(await api<AutomationOverview>("")); setNow(Date.now()); setError(""); }
      catch (e) { setError(e instanceof Error ? e.message : "Laden fehlgeschlagen."); }
      finally { pending.current = null; setRefreshing(false); }
    })();
    return pending.current;
  }, []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!stopped) timer = setTimeout(poll, 30_000); };
    void poll();
    const clock = setInterval(() => setNow(Date.now()), 10_000);
    return () => { stopped = true; clearTimeout(timer); clearInterval(clock); };
  }, [refresh]);
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    if (file.size > 50 * 1024 * 1024) { setUploadMessage("Die Datei darf höchstens 50 MB groß sein."); return; }
    setUploading(true); setUploadMessage("");
    try {
      const params = new URLSearchParams({ name: String(data.get("name")), printerId: String(data.get("printerId")),
        fileName: file.name, plate: String(data.get("plate")), useAms: "false", amsMapping: "" });
      await api(`/templates?${params}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      form.reset(); await refresh(); setUploadMessage("Druckvorlage gespeichert. Du kannst sie jetzt beim Drucker auswählen.");
    } catch (e) { setUploadMessage(e instanceof Error ? e.message : "Upload fehlgeschlagen."); }
    finally { setUploading(false); }
  };
  return <div className="space-y-7">
    <PageTitle eyebrow="Nur für Admins" title="Drucker & Dauerschleifen" subTitle="Aktuelle Aufträge, gespeicherte Druckserien und der nächste automatische Start im Überblick." />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{overview ? `Zuletzt geladen: ${timestamp(overview.fetchedAt)} · Aktualisierung alle 30 Sekunden` : "Druckerstatus wird abgerufen …"}</p>
      <Button onClick={refresh} loading={refreshing} size="small">Jetzt aktualisieren</Button>
    </div>
    <details className="rounded-lg bg-muted p-4 text-sm leading-relaxed">
      <summary className="cursor-pointer font-semibold">So funktioniert die Dauerschleife</summary>
      <p className="mt-2">Eine Serie umfasst 1–100 Drucke. Nach jedem Druck wird das Bett freigeräumt; der nächste Druck startet nach 15 Minuten beobachtetem Leerlauf und zwei aktuellen Kameraaufnahmen mit freiem Bett.</p>
      <p className="mt-2">
      Im Testbetrieb werden die Bedingungen geprüft, ohne einen Druck zu starten. Für den Echtbetrieb müssen Material, Druckplatte und Druckvorlage zum ausgewählten Drucker passen. Die Bildprüfung kann sich irren; prüfe ihre Ergebnisse vor der ersten Aktivierung.
      Kamerabilder werden zur Auswertung an die konfigurierte OpenAI-Anbindung gesendet.
      </p>
    </details>
    {error && <div role="alert" className="rounded-lg bg-warning-soft p-4"><p>{error}</p>{overview && <p className="mt-2 text-sm">Die angezeigten Daten stammen vom letzten erfolgreichen Abruf.</p>}</div>}
    {!overview && !error && <p role="status">Druckautomatik wird geladen …</p>}
    {overview && <>
      {overview.storage.message && <p role="status" className="rounded-lg bg-warning-soft p-4 text-sm">{overview.storage.message}</p>}
      {overview.printerStatus.message && <p role="status" className="rounded-lg bg-warning-soft p-4 text-sm">{overview.printerStatus.message}</p>}
      <p className={`rounded-lg p-4 text-sm ${overview.bridge.connected ? "bg-success-soft" : "bg-warning-soft"}`}>
        {overview.bridge.message}
      </p>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {overview.printers.map(printer => <PrinterCard key={printer.id} printer={printer} overview={overview}
          automation={overview.automations.find(a => a.printer_id === printer.id)} refresh={refresh} now={now} />)}
      </div>
      <section className="knglmrt-border rounded-lg bg-card p-5 sm:p-6">
        <h2 className="text-xl font-bold">Druckvorlage hinterlegen</h2>
        <p className="mt-2 text-sm text-muted-foreground">In Bambu Studio für den gewünschten Drucker slicen und als .gcode.3mf exportieren. Eine ungeslicte Projektdatei reicht nicht.</p>
        <form onSubmit={upload}><fieldset disabled={uploading || !overview.storage.available} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Name<input name="name" required maxLength={120} className={field} /></label>
          <label className="text-sm font-semibold">Drucker<select name="printerId" required className={field}>
            {overview.printers.map(p => <option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}
          </select></label>
          <label className="text-sm font-semibold">Druckdatei<input name="file" type="file" required accept=".3mf" className={field} /></label>
          <label className="text-sm font-semibold">Platte in der Datei<input name="plate" type="number" min={1} max={100} defaultValue={1} required className={field} /></label>
          <p className="text-sm text-muted-foreground sm:col-span-2">Die Zuführung wird vor jedem Start automatisch anhand der Materialvorgabe des Druckers gewählt. Aktuell werden Druckdateien mit genau einem Filament und einem Extruder unterstützt.</p>
          <div className="sm:col-span-2"><Button type="submit" kind="primary" loading={uploading}>Vorlage speichern</Button></div>
        </fieldset></form>
        {uploadMessage && <p role="status" className="mt-3 text-sm">{uploadMessage}</p>}
        {overview.templates.length > 0 && <ul className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
          {overview.templates.map(t => <li key={t.id}><strong>{t.name}</strong> · {t.file_name} · Platte {t.plate} · {t.model}</li>)}
        </ul>}
      </section>
      <section><h2 className="text-xl font-bold">Letzte Startversuche</h2>
        {!overview.storage.available ? <p className="mt-3 text-sm text-muted-foreground">Startverlauf nicht abrufbar.</p> : overview.runs.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Noch keine Druckstarts durch die Automatik.</p> :
          <ul className="mt-4 space-y-3">{overview.runs.map(run => <li key={run.id} className="knglmrt-border rounded-lg bg-card p-4 text-sm">
            <p className="font-bold">{overview.printers.find(p => p.id === run.printer_id)?.name ?? "Drucker"} · {runLabels[run.state]}</p>
            <p>{overview.templates.find(t => t.id === run.template_id)?.name ?? "Vorlage nicht mehr verfügbar"}</p>
            <p>{run.message}</p><time className="text-muted-foreground">{timestamp(run.created_at)}</time>
          </li>)}</ul>}
      </section>
    </>}
  </div>;
}
