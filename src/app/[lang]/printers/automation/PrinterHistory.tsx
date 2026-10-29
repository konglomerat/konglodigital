"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Button from "@/components/knglmrt/Button";
import type { PrinterHistoryJob } from "@/lib/bambu-cloud";
import type { HistoryDraft } from "@/lib/printer-automation/local-state";
import { automationApi as api } from "./api";

const field = "mt-1 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-foreground";
const date = (value?: string) => value ? new Date(value).toLocaleString("de-DE") : "Datum unbekannt";
const status = (value: string) => ({ "1": "Druckt", "2": "Abgeschlossen", "3": "Abgebrochen / fehlgeschlagen", "4": "Abgebrochen / fehlgeschlagen" })[value] ?? value;
type HistoryPage = { jobs: PrinterHistoryJob[]; nextOffset: number | null; selection: HistoryDraft | null; historyError: string | null; selectionError: string | null };

export default function PrinterHistory({ printerId, storageAvailable, onTemplate }: {
  printerId: string; storageAvailable: boolean; onTemplate: (id: string) => Promise<void>;
}) {
  const [jobs, setJobs] = useState<PrinterHistoryJob[]>([]);
  const [selection, setSelection] = useState<HistoryDraft | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [plate, setPlate] = useState(1);
  const [importedId, setImportedId] = useState<string | null>(null);
  const applySelection = useCallback((draft: HistoryDraft | null) => {
    setSelection(draft); setPlate(draft?.file?.plate ?? draft?.job.plate ?? 1);
    setImportedId(null);
  }, []);
  const load = useCallback(async (offset = 0, signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const page = await api<HistoryPage>(`/history?printerId=${encodeURIComponent(printerId)}&offset=${offset}`, { signal });
      if (signal?.aborted) return;
      if (page.historyError) setError(page.historyError);
      else { setJobs(previous => offset ? [...new Map([...previous, ...page.jobs].map(job => [job.id, job])).values()] : page.jobs); setNextOffset(page.nextOffset); }
      if (page.selectionError) setError(page.selectionError);
      else if (offset === 0) applySelection(page.selection);
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Historie konnte nicht geladen werden."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [printerId, applySelection]);
  useEffect(() => { const controller = new AbortController(); void load(0, controller.signal); return () => controller.abort(); }, [load]);
  const choose = async (job: PrinterHistoryJob) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api<{ selection: HistoryDraft }>("/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printerId, taskId: job.id }) });
      applySelection(data.selection); setMessage("Für diesen Drucker vorgemerkt. Die laufende Automatik wurde nicht geändert.");
    } catch (e) { setError(e instanceof Error ? e.message : "Auswahl fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    if (!selection) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/history", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printerId, taskId: selection.job.id }) });
      applySelection(null); setMessage("Vormerkung entfernt. Die laufende Automatik wurde nicht geändert.");
    } catch (e) { setError(e instanceof Error ? e.message : "Vormerkung konnte nicht entfernt werden."); }
    finally { setBusy(false); }
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selection) return;
    const form = event.currentTarget;
    const file = new FormData(form).get("file");
    if (!(file instanceof File) || !file.size) return;
    if (file.size > 50 * 1024 * 1024) { setError("Die Datei darf höchstens 50 MB groß sein."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const params = new URLSearchParams({ printerId, taskId: selection.job.id, fileName: file.name, plate: String(plate), useAms: "false", amsMapping: "" });
      const data = await api<{ selection: HistoryDraft }>(`/history/file?${params}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file });
      applySelection(data.selection); form.reset(); setMessage("Druckdatei geprüft und zur Auswahl gespeichert. Noch kein Druckstart freigegeben.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const importTemplate = async () => {
    if (!selection?.file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ id: string }>("/history/import", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerId, taskId: selection.job.id, fileId: selection.file.id }) });
      setImportedId(result.id); await onTemplate(result.id);
      setMessage("Druckvorlage übernommen und unten ausgewählt. Druckanzahl prüfen und Testbetrieb oder Automatik separat speichern.");
    } catch (e) { setError(e instanceof Error ? e.message : "Übernahme fehlgeschlagen."); }
    finally { setBusy(false); }
  };
  const visible = jobs.filter(job => job.title.toLocaleLowerCase("de").includes(search.toLocaleLowerCase("de")));
  return <div className="mt-4 rounded-md border border-border p-4">
    <h3 className="font-bold">Druck aus der Historie auswählen</h3>
    {selection ? <div className="mt-3 rounded-md bg-primary/5 p-3 text-sm">
      <p className="text-xs font-bold uppercase text-primary">Für die Dauerschleife vorgemerkt</p>
      <p className="mt-1 break-words font-bold">{selection.job.title}</p>
      <p className="mt-1 text-muted-foreground">{date(selection.job.startTime)} · Platte {selection.job.plate} · {status(selection.job.status)}</p>
      <p className="mt-2">{selection.file ? `Druckdatei bereit: ${selection.file.fileName}` : "Druckdatei fehlt noch — passende .gcode.3mf hinzufügen."}</p>
      <Button kind="quiet" size="chip" className="mt-2" onClick={clear} disabled={busy}>Vormerkung entfernen</Button>
    </div> : <p className="mt-2 text-sm text-muted-foreground">{loading ? "Historie wird geladen …" : "Noch kein Historiendruck vorgemerkt."}</p>}
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold">{selection ? "Anderen Druck auswählen" : "Druckhistorie öffnen"}</summary>
      <label className="mt-3 block text-sm">Geladene Drucke durchsuchen<input type="search" value={search} onChange={e => setSearch(e.target.value)} className={field} placeholder="Name des Drucks" /></label>
      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto" aria-label="Druckhistorie dieses Druckers">
        {visible.map(job => <li key={job.id}>
          <button type="button" aria-pressed={selection?.job.id === job.id} disabled={busy || loading} onClick={() => choose(job)}
            className={`w-full rounded-md border p-3 text-left text-sm disabled:opacity-50 ${selection?.job.id === job.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
            <span className="block break-words font-bold">{job.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{date(job.startTime)} · {status(job.status)} · Platte {job.plate}</span>
            <span className="mt-1 block text-xs font-semibold text-primary">{selection?.job.id === job.id ? "Ausgewählt" : "Für Dauerschleife vormerken"}</span>
          </button>
        </li>)}
      </ul>
      {!loading && !visible.length && <p className="mt-3 text-sm text-muted-foreground">{search ? "Kein Treffer in den geladenen Drucken." : "Keine Einträge für diesen Drucker vorhanden."}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {nextOffset !== null && <Button size="small" onClick={() => load(nextOffset)} disabled={busy || loading}>Ältere Drucke laden</Button>}
        <Button size="small" onClick={() => load()} disabled={busy || loading}>Historie aktualisieren</Button>
      </div>
    </details>
    {selection && <details className="mt-4" key={selection.job.id} open={!selection.file}>
      <summary className="cursor-pointer text-sm font-semibold">{selection.file ? "Druckdatei ersetzen" : "Druckdatei zur Auswahl hinzufügen"}</summary>
      <p className="mt-2 text-xs text-muted-foreground">In Bambu Studio slicen und als .gcode.3mf exportieren. Modell und Druckplatte werden beim Upload geprüft. Das passende Fach wird vor jedem Start anhand der Materialvorgabe neu gewählt.</p>
      <form onSubmit={upload}><fieldset disabled={busy} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-sm sm:col-span-2">Geslicte Druckdatei<input name="file" type="file" required accept=".3mf" className={field} /></label>
        <label className="text-sm">Platte in dieser Datei<input type="number" min={1} max={100} required value={plate} onChange={e => setPlate(Number(e.target.value))} className={field} /></label>

        <div className="sm:col-span-2"><Button type="submit" size="small">Druckdatei speichern</Button></div>
      </fieldset></form>
    </details>}
    {selection?.file && <div className="mt-4">
      <Button size="small" onClick={importTemplate} disabled={busy || !storageAvailable || Boolean(importedId)}>Als Druckvorlage übernehmen</Button>
      {!storageAvailable && <p className="mt-2 text-xs text-muted-foreground">Auswahl und Datei sind gespeichert. Die Übernahme in die Automatik ist nach Einrichtung ihrer Datenbank möglich.</p>}
    </div>}
    {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </div>;
}
