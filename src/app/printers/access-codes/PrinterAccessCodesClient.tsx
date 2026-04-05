"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type AccessCodeEntry = {
  id: string;
  sender: string | null;
  recipient: string | null;
  subject: string | null;
  access_code: string | null;
  extracted_from: "subject" | "body" | "none";
  body_preview: string | null;
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
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
          3D-Druck
        </p>
        <h1 className="text-3xl font-semibold text-zinc-900">
          Zugangscodes aus E-Mail
        </h1>
        <p className="max-w-3xl text-sm text-zinc-500">
          Diese Ansicht aktualisiert sich automatisch und zeigt weitergeleitete
          E-Mails aus CloudMailin inklusive erkanntem Zugangscode.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <Link
            href="/printers/emptying"
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            Zurueck zu Druckerstatus
          </Link>
          {lastUpdatedAt ? (
            <span>Zuletzt aktualisiert: {formatDateTime(lastUpdatedAt)}</span>
          ) : null}
        </div>
      </header>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
          Lade E-Mails...
        </div>
      ) : null}

      {!loading && !errorMessage && entries.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
          Noch keine weitergeleiteten E-Mails gefunden.
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Zeit</th>
                  <th className="px-4 py-3">Absender</th>
                  <th className="px-4 py-3">Empfaenger</th>
                  <th className="px-4 py-3">Betreff</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Quelle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {entries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="px-4 py-4 text-zinc-700">
                      {formatDateTime(entry.created_at)}
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      {entry.sender ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      {entry.recipient ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      {entry.subject ?? "-"}
                    </td>
                    <td className="px-4 py-4">
                      {entry.access_code ? (
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {entry.access_code}
                        </span>
                      ) : (
                        <span className="text-zinc-400">Kein Treffer</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-zinc-700">
                      {entry.extracted_from}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
