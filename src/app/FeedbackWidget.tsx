"use client";

// Der Feedback-Button am rechten Bildschirmrand. Bewusst leise: graue Fläche,
// kein Schatten — Pink bleibt den Handlungen der Seite. Nur das Gesicht wird
// beim Darüberfahren pink und legt den Kopf schief.
import { useId, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faPen,
  faTrash,
  faTriangleExclamation,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";

import { EditToggle } from "@/app/[lang]/account/AccountSection";
import Button from "@/components/knglmrt/Button";
import Dialog from "@/components/knglmrt/Dialog";
import Face from "@/components/knglmrt/Face";
import Field from "@/components/knglmrt/Field";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import Textarea from "@/components/knglmrt/Textarea";
import { useI18n } from "@/i18n/client";
import {
  FEEDBACK_DISCUSSIONS_URL,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_NAME_MAX,
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_MAX_EDGE,
  formatPublicFeedbackName,
  type FeedbackResponse,
  type FeedbackType,
} from "@/lib/feedback/feedback";

type Screenshot = { blob: Blob; previewUrl: string };

const toJpeg = (source: CanvasImageSource, width: number, height: number) => {
  const scale = Math.min(1, FEEDBACK_SCREENSHOT_MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.82);
  });
};

export default function FeedbackWidget({
  defaultName,
}: {
  defaultName: string | null;
}) {
  const { tx, locale } = useI18n();
  const formId = useId();
  const nameFieldId = useId();
  const tabRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [name, setName] = useState(defaultName ?? "");
  // Ohne bekannten Namen gibt es nichts anzuzeigen — dann gleich das Feld.
  const [editingName, setEditingName] = useState(!defaultName?.trim());
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FeedbackResponse | null>(null);

  const replaceScreenshot = (blob: Blob | null) => {
    if (screenshot) URL.revokeObjectURL(screenshot.previewUrl);
    setScreenshot(
      blob ? { blob, previewUrl: URL.createObjectURL(blob) } : null,
    );
  };

  const closeDialog = () => {
    if (sending) return;
    setOpen(false);
    setError(null);
    if (result) {
      setResult(null);
      setEditingName(false);
      setMessage("");
      setType("bug");
      replaceScreenshot(null);
    }
    requestAnimationFrame(() => tabRef.current?.focus());
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const blob = await toJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      if (!blob) throw new Error("toBlob returned null");
      replaceScreenshot(blob);
    } catch {
      setError(tx("Dieses Bild können wir leider nicht lesen."));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (!message.trim() || message.length > FEEDBACK_MESSAGE_MAX) return;
    if (screenshot && screenshot.blob.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
      setError(tx("Das Bild ist zu groß."));
      return;
    }

    setSending(true);
    setError(null);

    const body = new FormData();
    body.set("type", type);
    body.set("name", name);
    body.set("message", message);
    if (type === "bug") {
      body.set(
        "context",
        JSON.stringify({
          path: window.location.pathname,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          pixelRatio: window.devicePixelRatio,
          touch: navigator.maxTouchPoints > 0,
          language: locale,
        }),
      );
    }
    if (screenshot) body.set("screenshot", screenshot.blob, "screenshot.jpg");

    try {
      const response = await fetch("/api/feedback", { method: "POST", body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setResult((await response.json()) as FeedbackResponse);
    } catch {
      setError(
        tx(
          "Das hat leider nicht geklappt. Versuch es bitte noch einmal oder schreib uns an support@konglomerat.org.",
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const isIdea = type === "feature";

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        aria-haspopup="dialog"
        aria-label={tx("Feedback geben")}
        onClick={() => setOpen(true)}
        className="group fixed right-0 top-1/2 z-30 flex min-h-11 w-7 -translate-y-1/2 rotate-180 cursor-pointer items-center justify-center gap-1 overflow-hidden bg-muted py-1 text-foreground/70 transition-colors [writing-mode:vertical-rl] hover:bg-[var(--ui-quiet-hover)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] focus-visible:outline-solid md:w-9 print:hidden"
      >
        <span
          aria-hidden="true"
          className="rotate-180 transition-[rotate,color] duration-200 group-hover:rotate-[165deg] group-hover:text-primary motion-reduce:transition-none"
        >
          {/* Die Zeichnung füllt nur rund zwei Drittel ihrer Fläche. */}
          <Face number={22} size={36} title="" />
        </span>
        <span className="knglmrt-label hidden pb-2 md:inline">
          {tx("Feedback")}
        </span>
      </button>

      <Dialog
        open={open}
        title={result ? tx("Danke für dein Feedback!") : tx("Feedback geben")}
        width={560}
        onCancel={closeDialog}
        actions={
          result ? (
            <Button kind="primary" onClick={closeDialog}>
              {tx("Schließen")}
            </Button>
          ) : (
            <>
              <Button kind="secondary" onClick={closeDialog} disabled={sending}>
                {tx("Abbrechen")}
              </Button>
              <Button
                kind="primary"
                type="submit"
                form={formId}
                loading={sending}
                disabled={!name.trim() || !message.trim()}
              >
                {tx("Absenden")}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="flex flex-col gap-3">
            <p>{tx("Dein Beitrag ist jetzt online.")}</p>
            <Button
              kind="tertiary"
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {tx("Beitrag auf GitHub ansehen")}
            </Button>
          </div>
        ) : (
          <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <SegmentedControl<FeedbackType>
              value={type}
              onChange={setType}
              size="small"
              className="self-start"
              options={[
                { value: "bug", label: tx("Fehler melden") },
                { value: "feature", label: tx("Idee vorschlagen") },
              ]}
            />

            {isIdea ? (
              <p>
                {tx("Bitte schau nach, ob es deine Idee schon gibt um Duplikate zu vermeiden:")}{" "}
                <a
                  href={FEEDBACK_DISCUSSIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-primary underline hover:text-[var(--ui-action-hover)]"
                >
                  {tx("Liste der Ideen auf Github")}
                </a>
              </p>
            ) : null}

            <Textarea
              label={isIdea ? tx("Was wünschst du dir?") : tx("Was ist passiert?")}
              required
              rows={4}
              counter={FEEDBACK_MESSAGE_MAX}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />

            <div className="-mt-2 flex flex-col gap-2">
              {screenshot ? (
                <>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau aus einer Blob-URL */}
                    <img
                      src={screenshot.previewUrl}
                      alt={tx("Vorschau des Bildes")}
                      className="h-20 w-auto max-w-[60%] knglmrt-border object-contain"
                    />
                    <Button
                      kind="quiet"
                      icon={faTrash}
                      onClick={() => replaceScreenshot(null)}
                    >
                      {tx("Entfernen")}
                    </Button>
                  </div>
                  <p className="flex items-start gap-2 text-[length:var(--ui-size-label)] leading-snug text-foreground/70">
                    <FontAwesomeIcon
                      icon={faTriangleExclamation}
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 flex-none"
                    />
                    <span>
                      {tx(
                        "Achte darauf, dass keine sensiblen Daten zu sehen sind, zum Beispiel Namen, Adressen oder Kontodaten. Das Bild wird mit deinem Beitrag öffentlich.",
                      )}
                    </span>
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    kind="quiet"
                    icon={faUpload}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {tx("Bild hochladen")}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFile}
                  />
                </div>
              )}
            </div>
            
            {editingName ? (
              <div className="flex items-end gap-3">
                <Field
                  id={nameFieldId}
                  label={tx("Dein Name")}
                  required
                  autoFocus
                  autoComplete="name"
                  maxLength={FEEDBACK_NAME_MAX}
                  className="min-w-0 flex-1"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter schließt nur das Namensfeld, sendet aber nichts ab.
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    if (name.trim()) setEditingName(false);
                  }}
                />
                <EditToggle
                  open
                  controls={nameFieldId}
                  icon={faCheck}
                  disabled={!name.trim()}
                  onClick={() => setEditingName(false)}
                >
                  {tx("Fertig")}
                </EditToggle>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="knglmrt-label">{tx("Dein Name")}</span>
                <div className="flex items-center gap-4">
                  <span>{formatPublicFeedbackName(name)}</span>
                  <EditToggle
                    open={false}
                    controls={nameFieldId}
                    icon={faPen}
                    onClick={() => setEditingName(true)}
                  >
                    {tx("Ändern")}
                  </EditToggle>
                </div>
              </div>
            )}

            <p className="text-[length:var(--ui-size-label)] leading-snug text-foreground/70">
              {isIdea
                ? tx(
                    "Deine Idee erscheint öffentlich in den GitHub Discussions, damit andere dafür abstimmen können. Dort stehen dein Vorname und der erste Buchstabe deines Nachnamens, deine E-Mail-Adresse bleibt privat.",
                  )
                : tx(
                    "Deine Meldung erscheint öffentlich als GitHub Issue, zusammen mit der aktuellen Seite, Browser, Gerätetyp und Fenstergröße. Dort stehen dein Vorname und der erste Buchstabe deines Nachnamens, deine E-Mail-Adresse bleibt privat.",
                  )}
            </p>

            {error ? (
              <p role="alert" className="font-bold text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        )}
      </Dialog>
    </>
  );
}
