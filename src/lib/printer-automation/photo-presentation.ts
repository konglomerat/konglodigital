import { isClearBed } from "./decision";
import { MAX_IMAGE_AGE_MS, type BedVerdict, type PrinterPhotoView } from "./types";

export function photoBedStatus(photo: PrinterPhotoView | null, now: number) {
  const check = photo?.check;
  const matches = Boolean(check && photo && check.imageHash === photo.sha256 && check.capturedAt === photo.capturedAt);
  const captured = Date.parse(photo?.capturedAt ?? "");
  const fresh = Number.isFinite(captured) && captured <= now + 2_000 && now - captured <= MAX_IMAGE_AGE_MS;
  const verdict = matches ? check!.verdict : null;
  const result: BedVerdict["state"] | null = !verdict ? null : verdict.state === "occupied" ? "occupied" : isClearBed(verdict) ? "empty" : "uncertain";
  return { result, fresh, current: fresh ? result : null };
}
