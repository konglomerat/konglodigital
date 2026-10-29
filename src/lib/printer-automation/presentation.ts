import type { Automation, AutomationOverview } from "./types";

export const printerStatusLabels = {
  idle: "Bereit", printing: "Druckt", paused: "Pausiert", offline: "Offline", error: "Fehler", unknown: "Unbekannt",
};

export function currentPrint(printer: AutomationOverview["printers"][number], automation: Automation | undefined, now: number) {
  const observedAt = Date.parse(printer.statusObservedAt ?? "");
  // UI polling is less strict than the worker's 30-second start gate. This never authorizes a print.
  const stale = Boolean(printer.statusStale || !Number.isFinite(observedAt) || now - observedAt > 90_000 || observedAt > now + 2_000);
  const active = printer.status === "printing" || printer.status === "paused";
  const fromLoop = Boolean(active && !stale && printer.statusSource === "live" && printer.liveStateConfirmed && automation?.last_run_id
    && printer.jobName?.includes(automation.last_run_id));
  return { stale, active, fromLoop, progress: Math.max(0, Math.min(100, Math.round(printer.progress || 0))) };
}

export function loopPhase(automation: Automation | undefined, available: boolean) {
  if (!available) return "Nicht abrufbar";
  if (!automation) return "Nicht eingerichtet";
  if (automation.mode === "off") return "Ausgeschaltet";
  if (automation.phase === "blocked") return "Prüfung erforderlich";
  if (automation.phase === "awaiting_start") return "Start wird bestätigt";
  if (automation.phase === "printing") return "Druck wird überwacht";
  return automation.mode === "observe" ? "Testbetrieb · ohne Druckstart" : "Wartet auf freien Drucker";
}
