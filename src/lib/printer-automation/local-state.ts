import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PrinterHistoryJob } from "@/lib/bambu-cloud";
import type { PhotoBedCheck, PrinterPhotoView } from "./types";

// Preparatory choices and last photos only. The print worker never reads this store.
// Deployments must mount this directory persistently and share it between app instances.
const root = () => path.resolve(process.env.PRINTER_AUTOMATION_DATA_DIR || ".data/printer-automation");
const key = (printerId: string) => createHash("sha256").update(printerId).digest("hex");
const location = (printerId: string, kind: string) => path.join(root(), `${key(printerId)}-${kind}.json`);
const draftLocks = new Map<string, Promise<unknown>>();
async function locked<T>(printerId: string, action: () => Promise<T>): Promise<T> {
  const previous = draftLocks.get(printerId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  draftLocks.set(printerId, next);
  try { return await next; } finally { if (draftLocks.get(printerId) === next) draftLocks.delete(printerId); }
}
async function read<T>(file: string, maxBytes: number): Promise<T | null> {
  try {
    if ((await fs.stat(file)).size > maxBytes) throw new Error("Private printer record too large");
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function write(file: string, data: unknown) {
  await fs.mkdir(root(), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: "wx" }); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}

export type LastPrinterPhoto = { capturedAt: string; source: "camera-service" | "cloud-test"; sha256: string; jpeg: string };
export async function readLastPrinterPhoto(printerId: string) {
  return read<LastPrinterPhoto>(location(printerId, "photo"), 6 * 1024 * 1024);
}
export async function saveLastPrinterPhoto(printerId: string, jpeg: Buffer, capturedAt: string, source: LastPrinterPhoto["source"]) {
  const date = Date.parse(capturedAt);
  if (!Number.isFinite(date) || date > Date.now() + 2_000 || jpeg.length > 4 * 1024 * 1024) throw new Error("Invalid camera snapshot");
  const metadata = await sharp(jpeg, { limitInputPixels: 12_000_000 }).metadata();
  if (metadata.format !== "jpeg" || !metadata.width || !metadata.height) throw new Error("Camera image must be JPEG");
  return locked(`photo:${printerId}`, async () => {
    const previous = await readLastPrinterPhoto(printerId);
    if (previous && Date.parse(previous.capturedAt) > date) return;
    await write(location(printerId, "photo"), { capturedAt, source,
      sha256: createHash("sha256").update(jpeg).digest("hex"), jpeg: jpeg.toString("base64") } satisfies LastPrinterPhoto);
  });
}

export const readPhotoBedCheck = (printerId: string) => read<PhotoBedCheck>(location(printerId, "bed-check"), 8192);
export async function savePhotoBedCheck(printerId: string, check: PhotoBedCheck) {
  return locked(`photo:${printerId}`, async () => {
    const photo = await readLastPrinterPhoto(printerId);
    // A slow analysis must never become the verdict for a newer camera frame.
    if (!photo || photo.sha256 !== check.imageHash || photo.capturedAt !== check.capturedAt) return false;
    await write(location(printerId, "bed-check"), check);
    return true;
  });
}
export async function readPrinterPhotoView(printerId: string): Promise<PrinterPhotoView | null> {
  const photo = await readLastPrinterPhoto(printerId);
  if (!photo) return null;
  const check = await readPhotoBedCheck(printerId);
  return { capturedAt: photo.capturedAt, source: photo.source, sha256: photo.sha256,
    url: `/api/admin/printer-automation/photo?printerId=${encodeURIComponent(printerId)}&format=image&v=${photo.sha256}`,
    check: check?.imageHash === photo.sha256 && check.capturedAt === photo.capturedAt ? check : null };
}

export type HistoryDraftFile = { id: string; fileName: string; model: string; plate: number; sha256: string; bytes: number; useAms: boolean; amsMapping: number[] };
export type HistoryDraft = { job: PrinterHistoryJob; selectedAt: string; file: HistoryDraftFile | null };
export const readHistoryDraft = (printerId: string) => read<HistoryDraft>(location(printerId, "draft"), 32_768);
export async function saveHistoryDraft(job: PrinterHistoryJob) {
  return locked(job.printerId, async () => {
    const current = await readHistoryDraft(job.printerId);
    // Selecting the same entry again must not lose an already attached file.
    if (current?.job.id === job.id) return current;
    const draft: HistoryDraft = { job, selectedAt: new Date().toISOString(), file: null };
    await write(location(job.printerId, "draft"), draft);
    return draft;
  });
}
export async function clearHistoryDraft(printerId: string, taskId: string) {
  return locked(printerId, async () => {
    const draft = await readHistoryDraft(printerId);
    if (draft && draft.job.id !== taskId) throw new Error("History selection changed");
    await fs.unlink(location(printerId, "draft")).catch(error => { if (error.code !== "ENOENT") throw error; });
  });
}
const filePath = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid draft file");
  return path.join(root(), `${id}.gcode.3mf`);
};
export async function attachHistoryDraftFile(printerId: string, taskId: string, bytes: Buffer, file: Omit<HistoryDraftFile, "id" | "bytes">) {
  return locked(printerId, async () => {
    const draft = await readHistoryDraft(printerId);
    if (!draft || draft.job.id !== taskId) throw new Error("History selection changed");
    const id = randomUUID();
    await fs.mkdir(root(), { recursive: true, mode: 0o700 });
    await fs.writeFile(filePath(id), bytes, { mode: 0o600, flag: "wx" });
    try {
      const next = { ...draft, file: { ...file, id, bytes: bytes.length } };
      await write(location(printerId, "draft"), next);
      return next;
    } catch (error) { await fs.unlink(filePath(id)).catch(() => {}); throw error; }
  });
}
export async function readHistoryDraftFile(file: HistoryDraftFile) {
  const filename = filePath(file.id);
  if ((await fs.stat(filename)).size > 50 * 1024 * 1024) throw new Error("Draft file too large");
  const bytes = await fs.readFile(filename);
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Draft file changed");
  return bytes;
}
