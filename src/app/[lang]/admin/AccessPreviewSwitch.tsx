"use client";
// Testauswahl für Admins unten in der Verwaltungsleiste: die App mit den
// Rechten einer anderen Person ansehen. Die Personenliste lädt erst, wenn
// man das Feld anfasst — sonst kostet jede Verwaltungsseite einen
// Nutzerabruf.
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { AccessPreviewResponse } from "@/app/api/admin/access-preview/route";

export type AccessPreviewState = {
  /** Wessen Rechte gerade gelten — null ohne Vorschau. */
  userId: string | null;
  name: string | null;
};

export default function AccessPreviewSwitch({
  preview,
}: Readonly<{ preview: AccessPreviewState }>) {
  const router = useRouter();
  const [people, setPeople] = useState<AccessPreviewResponse["people"] | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    if (people) return;
    try {
      const response = await fetch("/api/admin/access-preview");
      const data = (await response.json()) as AccessPreviewResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Fehler beim Laden.");
      setPeople(data.people);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Fehler beim Laden.",
      );
    }
  }, [people]);

  const switchTo = async (userId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/access-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId || null }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Umschalten fehlgeschlagen.");
      }
      // Guards und Daten hängen an den Rechten: alles neu vom Server holen.
      router.refresh();
    } catch (switchError) {
      setError(
        switchError instanceof Error
          ? switchError.message
          : "Umschalten fehlgeschlagen.",
      );
    } finally {
      setBusy(false);
    }
  };

  const active = preview.userId !== null;

  return (
    <div
      className={`mt-auto flex flex-col gap-1.5 border-t border-white/15 px-5 pb-5 pt-4 ${
        active ? "bg-[var(--knglmrt-pink-60)]/25" : ""
      }`}
    >
      <label
        htmlFor="access-preview-select"
        className="knglmrt-caption text-[var(--knglmrt-dark-30)]"
      >
        Rechte testen als
      </label>
      <select
        id="access-preview-select"
        value={preview.userId ?? ""}
        disabled={busy}
        onFocus={() => void loadPeople()}
        onPointerDown={() => void loadPeople()}
        onChange={(event) => void switchTo(event.target.value)}
        className="w-full border border-white/30 bg-[var(--knglmrt-dark-100)] px-2 py-1.5 text-[length:var(--ui-size-nav)] text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:opacity-60"
      >
        <option value="">Mir selbst</option>
        {people
          ? people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))
          : preview.userId
            ? (
                <option value={preview.userId}>
                  {preview.name ?? preview.userId}
                </option>
              )
            : null}
      </select>
      {active ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void switchTo("")}
          className="self-start text-[13px] text-white underline underline-offset-2 hover:text-[var(--knglmrt-dark-30)]"
        >
          Vorschau beenden
        </button>
      ) : null}
      {error ? <p className="text-[13px] text-white">{error}</p> : null}
    </div>
  );
}
