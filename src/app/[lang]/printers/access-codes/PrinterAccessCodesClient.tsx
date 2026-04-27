"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { useCallback, useEffect, useState } from "react";
import print3dImage from "../../../3dprint.jpg";

type AccessCodeEntry = {
  id: string;
  sender: string | null;
  recipient: string | null;
  subject: string | null;
  access_code: string | null;
  extracted_from: "subject" | "body" | "none";
  body_preview: string | null;
  body_full: string | null;
  created_at: string;
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Anfrage fehlgeschlagen.");
  }
  return data;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function PrinterAccessCodesClient() {
  const [entries, setEntries] = useState<AccessCodeEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const data = await fetchJson<{ entries: AccessCodeEntry[] }>(
        "/api/admin/access-codes?limit=100",
      );
      setEntries(data.entries ?? []);
      setErrorMessage(null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Codes konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
    const interval = window.setInterval(() => {
      void loadEntries();
    }, 5_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadEntries]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-success-border bg-success-soft p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="mx-auto w-full max-w-[320px] md:mx-0 md:max-w-[320px]">
            <Image
              src={print3dImage}
              alt="3D-Druck"
              className="h-48 w-full rounded-2xl object-cover object-center multiply md:h-53"
              priority={false}
            />
          </div>
          <div className="space-y-3 text-base text-success md:text-lg">
            <p className="text-lg font-semibold md:text-xl">
              Kurzer Friendly Reminder
            </p>
            <p>
              Bitte geht gut mit den 3D-Druckern um und denkt ans Bezahlen eurer
              Drucke. Wenn etwas kaputt geht, macht es bitte wieder ganz oder
              holt euch kurz Hilfe. Und wenn ihr gerade dabei seid: einmal kurz
              sauber machen hilft allen. Danke euch und viel Spaß beim Bauen von
              coolen Sachen.
            </p>
          </div>
        </div>
      </section>

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground/80">
          3D-Druck
        </p>
        <h1 className="text-3xl font-semibold text-foreground">
          Bambu Lab Zugangscodes aus E-Mail
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Diese Ansicht aktualisiert sich automatisch und zeigt weitergeleitete
          E-Mails mit Zugangscodes an.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Link
            href="/printers/emptying"
            className="rounded-full border border-border bg-card px-3 py-1.5 font-semibold text-foreground/80 transition hover:bg-muted/50"
          >
            Zurueck zu Druckerstatus
          </Link>
          {lastUpdatedAt ? (
            <span>Zuletzt aktualisiert: {formatDateTime(lastUpdatedAt)}</span>
          ) : null}
        </div>
      </header>

      {errorMessage ? (
        <div className="rounded-2xl border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Lade E-Mails...
        </div>
      ) : null}

      {!loading && !errorMessage && entries.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Noch keine weitergeleiteten E-Mails gefunden.
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Zeit</th>
                  <th className="px-4 py-3">Betreff</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">E-Mail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {entries.map((entry) => {
                  const isExpanded = expandedEntryId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr className="align-top">
                        <td className="px-4 py-4 text-foreground/80">
                          {formatDateTime(entry.created_at)}
                        </td>
                        <td className="px-4 py-4 text-foreground/80">
                          {entry.subject ?? "-"}
                        </td>
                        <td className="px-4 py-4">
                          {entry.access_code ? (
                            <span className="inline-flex rounded-full border border-primary-border bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                              {entry.access_code}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/80">Kein Treffer</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedEntryId((current) =>
                                current === entry.id ? null : entry.id,
                              )
                            }
                            className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground/80 transition hover:bg-muted/50"
                          >
                            {isExpanded ? "Body ausblenden" : "Body anzeigen"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="bg-muted/70">
                          <td colSpan={4} className="px-4 pb-4 pt-1">
                            <div className="rounded-2xl border border-border bg-card p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Voller E-Mail-Body
                              </p>
                              <pre className="whitespace-pre-wrap break-words text-xs text-foreground/80">
                                {entry.body_full ??
                                  entry.body_preview ??
                                  "Kein Body vorhanden."}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
