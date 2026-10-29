import { AutomationError } from "./auth";
import { readLastPrinterPhoto, readPhotoBedCheck, savePhotoBedCheck } from "./local-state";
import { inspectPrinterBed, printerBedVisionModel } from "./vision";
import type { PhotoBedCheck } from "./types";

// Display-only checks. The print worker always captures and analyses fresh frames itself.
const pending = new Map<string, Promise<PhotoBedCheck>>();
export async function checkSavedPrinterPhoto(printerId: string, expectedHash: string): Promise<PhotoBedCheck> {
  const key = `${printerId}:${expectedHash}`;
  const running = pending.get(key);
  if (running) return running;
  const task = (async () => {
    const photo = await readLastPrinterPhoto(printerId);
    if (!photo) throw new AutomationError("Noch kein Kamerafoto vorhanden.", 404);
    if (photo.sha256 !== expectedHash) throw new AutomationError("Es gibt ein neueres Foto. Bitte die Ansicht aktualisieren.", 409);
    const previous = await readPhotoBedCheck(printerId);
    if (previous?.imageHash === photo.sha256 && previous.capturedAt === photo.capturedAt) return previous;
    if (!process.env.OPENAI_API_KEY) throw new AutomationError("Die OpenAI-Bildprüfung ist noch nicht eingerichtet.", 503);
    let verdict;
    try { verdict = await inspectPrinterBed(Buffer.from(photo.jpeg, "base64")); }
    catch { throw new AutomationError("OpenAI konnte das Foto nicht auswerten. Bitte erneut versuchen.", 503); }
    const check: PhotoBedCheck = { imageHash: photo.sha256, capturedAt: photo.capturedAt,
      checkedAt: new Date().toISOString(), model: printerBedVisionModel(), verdict };
    if (!(await savePhotoBedCheck(printerId, check))) throw new AutomationError("Während der Prüfung wurde das Foto erneuert. Bitte die Ansicht aktualisieren.", 409);
    return check;
  })();
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}
