import type { BambuPrinter } from "@/lib/bambu";
import {
  IDLE_MS, MAX_IMAGE_AGE_MS, MAX_OBSERVATION_GAP_MS,
  MAX_STATUS_AGE_MS, MIN_CLEAR_INTERVAL_MS,
  type Automation, type BedVerdict,
} from "./types";

export function isFreshPrinterState(printer: BambuPrinter | undefined, now: number) {
  const observed = Date.parse(printer?.statusObservedAt ?? "");
  return Boolean(printer && printer.liveStateConfirmed === true && printer.statusSource === "live"
    && !printer.statusStale && Number.isFinite(observed)
    && observed <= now + 2_000 && now - observed <= MAX_STATUS_AGE_MS);
}

export function isFreshIdle(printer: BambuPrinter | undefined, now: number) {
  return isFreshPrinterState(printer, now) && printer?.status === "idle";
}

export function observeIdle(automation: Automation, printer: BambuPrinter | undefined, now: number) {
  const previous = Date.parse(automation.last_observed_at ?? "");
  const idle = Date.parse(automation.idle_since ?? "");
  if (!isFreshIdle(printer, now)) return { idleSince: null, ready: false };
  const continuous = Number.isFinite(previous) && previous <= now
    && now - previous <= MAX_OBSERVATION_GAP_MS
    && Number.isFinite(idle) && idle <= previous;
  const idleSince = continuous ? automation.idle_since! : new Date(now).toISOString();
  return { idleSince, ready: now - Date.parse(idleSince) >= IDLE_MS };
}

export function isClearBed(verdict: BedVerdict) {
  return verdict.state === "empty" && Number.isFinite(verdict.confidence)
    && verdict.confidence >= 0.98 && verdict.confidence <= 1
    && verdict.fullBedVisible === true && verdict.platePresent === true
    && verdict.personOrHandVisible === false;
}

export function confirmClearBed(automation: Automation, verdict: BedVerdict, image: {
  capturedAt: string; hash: string;
}, now: number) {
  const captured = Date.parse(image.capturedAt);
  const previous = Date.parse(automation.clear_since ?? "");
  const fresh = Number.isFinite(captured) && captured <= now + 2_000
    && now - captured <= MAX_IMAGE_AGE_MS;
  if (!fresh || !isClearBed(verdict)) return { clearSince: null, ready: false };
  // An identical frame cannot prove the camera is still delivering fresh images.
  if (image.hash === automation.last_image_hash) return { clearSince: null, ready: false };
  const continuous = isClearBed(automation.last_verdict ?? {
    state: "uncertain", confidence: 0, fullBedVisible: false,
    platePresent: false, personOrHandVisible: false, reason: "",
  }) && Number.isFinite(previous) && captured > previous
    && captured - previous <= MAX_OBSERVATION_GAP_MS;
  return {
    clearSince: continuous ? automation.clear_since : image.capturedAt,
    ready: continuous && captured - previous >= MIN_CLEAR_INTERVAL_MS,
  };
}

export function normalizePrinterModel(value: string) {
  const normalized = value.toUpperCase().replace(/BAMBU\s*LAB/g, "").replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, string> = { A1MINI: "A1MINI", A1M: "A1MINI", N1: "A1MINI", C11: "P1S", P1S: "P1S", N2S: "A1", A1: "A1", H2D: "H2D" };
  return aliases[normalized] ?? normalized;
}
