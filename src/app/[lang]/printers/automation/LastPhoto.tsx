"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/knglmrt/Button";
import type { PhotoBedCheck, PrinterPhotoView } from "@/lib/printer-automation/types";
import { photoBedStatus } from "@/lib/printer-automation/photo-presentation";
import { automationApi } from "./api";

const resultLabels = { empty: "Frei erkannt", occupied: "Belegt", uncertain: "Unklar" };
const resultStyles = {
  empty: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  occupied: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  uncertain: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};
const warningText = "text-amber-800 dark:text-amber-200";
export default function LastPhoto({ printerId, name, refreshedAt, canCapture, now }: {
  printerId: string; name: string; refreshedAt: string; canCapture: boolean; now: number;
}) {
  const [photo, setPhoto] = useState<PrinterPhotoView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const attempted = useRef("");
  const pending = useRef(false);
  const requestVersion = useRef(0);
  const checkPhoto = useCallback(async (target: PrinterPhotoView) => {
    if (pending.current) return;
    pending.current = true;
    attempted.current = `${target.sha256}:${target.capturedAt}`;
    setChecking(true); setCheckError("");
    try {
      const { check } = await automationApi<{ check: PhotoBedCheck }>(`/photo/check?printerId=${encodeURIComponent(printerId)}&hash=${target.sha256}`, { method: "POST" });
      setPhoto(current => current?.sha256 === check.imageHash && current.capturedAt === check.capturedAt ? { ...current, check } : current);
    } catch (failure) { setCheckError(failure instanceof Error ? failure.message : "Bildprüfung fehlgeschlagen."); }
    finally { pending.current = false; setChecking(false); }
  }, [printerId]);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    void automationApi<{ photo: PrinterPhotoView | null }>(`/photo?printerId=${encodeURIComponent(printerId)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted && version === requestVersion.current) {
        setPhoto(current => data.photo && current?.sha256 === data.photo.sha256 && current.capturedAt === data.photo.capturedAt
          ? { ...data.photo, check: data.photo.check ?? current.check } : data.photo);
        setError(""); setImageFailed(false); setLoaded(true);
      } })
      .catch(() => { if (!controller.signal.aborted) { setError("Letztes Kamerafoto konnte nicht geladen werden."); setLoaded(true); } });
    return () => controller.abort();
  }, [printerId, refreshedAt]);
  useEffect(() => {
    if (photo && !photo.check && !checking && attempted.current !== `${photo.sha256}:${photo.capturedAt}`) void checkPhoto(photo);
  }, [photo, checking, checkPhoto]);
  const capture = async () => {
    if (pending.current) return;
    pending.current = true; requestVersion.current++;
    setChecking(true); setCheckError("");
    try {
      const data = await automationApi<{ photo: PrinterPhotoView | null }>(`/camera?printerId=${encodeURIComponent(printerId)}`, { method: "POST" });
      requestVersion.current++;
      setPhoto(data.photo); setImageFailed(false); setError("");
    } catch (failure) { setCheckError(failure instanceof Error ? failure.message : "Kameraprüfung fehlgeschlagen."); }
    finally { pending.current = false; setChecking(false); }
  };
  const status = photoBedStatus(photo, now);
  const state = error || imageFailed ? "uncertain" : status.current ?? "uncertain";
  return <figure className="mt-4 overflow-hidden rounded-md border border-border">
    <div className="border-b border-border px-4 py-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Druckbett · OpenAI-Bildcheck</h3>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${resultStyles[state]}`}>
          {state === "uncertain" ? "Aktuell unklar" : resultLabels[state]}
        </span>
      </div>
      {status.result && photo?.check ? <>
        <p className="mt-2 text-sm font-semibold">Auf dem Foto: {resultLabels[status.result]}</p>
        <p className="mt-1 text-sm">{photo.check.verdict.reason}</p>
        {status.result === "uncertain" && photo.check.verdict.state === "empty" && <p className={`mt-1 text-sm ${warningText}`}>Die Bewertung erfüllt nicht alle Kriterien für „frei erkannt“; deshalb bleibt das Ergebnis unklar.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Ausgewertet am {new Date(photo.check.checkedAt).toLocaleString("de-DE")} · {photo.check.model}</p>
      </> : <p className="mt-2 text-sm text-muted-foreground">{checking ? "OpenAI prüft das Druckbett …" : photo ? "Noch keine Bildprüfung vorhanden." : "Für die Prüfung wird ein Kamerafoto benötigt."}</p>}
      {photo && !status.fresh && <p className={`mt-2 text-sm ${warningText}`}>Kein aktuelles Foto (maximal 60 Sekunden alt) – der jetzige Zustand ist nicht bestätigt.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => photo && void checkPhoto(photo)} disabled={!photo || checking || Boolean(photo.check)}>
          {checking ? "Bildprüfung läuft …" : photo?.check ? "Foto ausgewertet" : "Foto mit OpenAI prüfen"}
        </Button>
        <Button onClick={capture} disabled={checking || !canCapture}>Neues Foto & prüfen</Button>
      </div>
      {canCapture && <p className="mt-2 text-xs text-muted-foreground">Vor neuen Cloud-Aufnahmen wird die Druckerbeleuchtung eingeschaltet.</p>}
      {!canCapture && <p className="mt-2 text-xs text-muted-foreground">Neue Aufnahmen sind erst mit verbundenem Kameradienst möglich. Neue gespeicherte Fotos werden beim Öffnen dieser Ansicht einmal mit OpenAI geprüft.</p>}
      {checkError && <p className="mt-2 text-sm text-destructive" role="alert">{checkError}</p>}
    </div>
    <div className="flex items-center justify-between gap-2 bg-muted px-4 py-2 text-sm">
      <span className="font-semibold">Letztes Kamerafoto</span><span className="text-xs text-muted-foreground">Kein Livebild</span>
    </div>
    {photo && !imageFailed ? <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Letztes Kamerafoto von ${name} vergrößern`}>
      <img src={photo.url} alt={`Gespeichertes Kamerafoto von ${name}`} onError={() => setImageFailed(true)} className="aspect-video max-h-64 w-full bg-black object-contain" />
    </a> : <p className="flex aspect-video max-h-64 items-center justify-center bg-muted p-5 text-center text-sm text-muted-foreground">
      {imageFailed ? "Das gespeicherte Bild ist momentan nicht verfügbar." : !loaded ? "Kamerafoto wird geladen …" : error || "Noch kein Kamerafoto gespeichert."}
    </p>}
    <figcaption className="px-4 py-3 text-xs text-muted-foreground">
      {photo && <>Aufgenommen am {new Date(photo.capturedAt).toLocaleString("de-DE")}{photo.source === "cloud-test" ? " · aus dem Cloud-Kameratest" : ""}. </>}
      Gespeicherte Fotos dienen zur Ansicht und geben keinen automatischen Druckstart frei.
      {photo && error && <span className="mt-1 block text-warning">{error}</span>}
    </figcaption>
  </figure>;
}
