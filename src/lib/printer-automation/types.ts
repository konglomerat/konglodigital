import type { BambuPrinter } from "@/lib/bambu";

export const IDLE_MS = 15 * 60_000;
export const MAX_STATUS_AGE_MS = 30_000;
export const MAX_OBSERVATION_GAP_MS = 180_000;
export const MIN_CLEAR_INTERVAL_MS = 20_000;
export const MAX_IMAGE_AGE_MS = 60_000;
export const MAX_TEMPLATE_BYTES = 50 * 1024 * 1024;
export const AUTOMATION_BUCKET = "printer-automation";

export type BedVerdict = {
  state: "empty" | "occupied" | "uncertain";
  confidence: number;
  fullBedVisible: boolean;
  platePresent: boolean;
  personOrHandVisible: boolean;
  reason: string;
};

export type PhotoBedCheck = {
  imageHash: string;
  capturedAt: string;
  checkedAt: string;
  model: string;
  verdict: BedVerdict;
};
export type PrinterPhotoView = {
  url: string;
  sha256: string;
  capturedAt: string;
  source: "camera-service" | "cloud-test";
  check: PhotoBedCheck | null;
};

export type PrintTemplate = {
  id: string;
  printer_id: string;
  name: string;
  file_name: string;
  storage_path: string;
  sha256: string;
  model: string;
  plate: number;
  use_ams: boolean;
  ams_mapping: number[];
  created_by: string | null;
  created_at: string;
};

export type Automation = {
  material_requirement?: import("./material").MaterialRequirement;
  printer_id: string;
  template_id: string | null;
  mode: "off" | "observe" | "armed";
  phase: "watching" | "awaiting_start" | "printing" | "blocked";
  remaining_runs: number;
  authorized_by: string | null;
  revision: number;
  idle_since: string | null;
  last_observed_at: string | null;
  clear_since: string | null;
  last_image_hash: string | null;
  last_image_at: string | null;
  last_verdict: BedVerdict | null;
  last_message: string;
  last_run_id: string | null;
  dispatched_at: string | null;
  checked_at: string | null;
  lease_token: string | null;
  lease_until: string | null;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
  printer_id: string;
  template_id: string;
  state: "dispatching" | "accepted" | "printing" | "completed" | "rejected" | "unknown";
  message: string;
  created_at: string;
};

export type BridgePrinter = { id: string; camera: boolean; canStart: boolean };
export type AutomationOverview = {
  printers: Omit<BambuPrinter, "serial">[];
  fetchedAt: string;
  storage: { available: boolean; message: string | null };
  printerStatus: { available: boolean; message: string | null };
  automations: Automation[];
  templates: Omit<PrintTemplate, "storage_path">[];
  runs: AutomationRun[];
  bridge: { connected: boolean; printers: BridgePrinter[]; message: string };
  liveEnabled: boolean;
};
