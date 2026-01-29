"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Printer = {
  id: string;
  name: string;
  model: string;
  serial: string;
  status: string;
  progress: number;
  jobName?: string;
  updatedAt: string;
  needsEmptying: boolean;
};

const statusStyles: Record<string, string> = {
  idle: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  printing: "bg-blue-50 text-blue-700 ring-blue-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  offline: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
};

const statusLabels: Record<string, string> = {
  idle: "Idle",
  printing: "Printing",
  paused: "Paused",
  offline: "Offline",
  error: "Error",
};

const formatUpdated = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

export default function PrinterEmptyingPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadPrinters = useCallback(async () => {
    try {
      const data = await fetchJson<{ printers: Printer[] }>(
        "/api/printers/emptying",
      );
      setPrinters(data.printers ?? []);
      setLastChecked(new Date().toISOString());
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to fetch printer status.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const fetchInitial = async () => {
      if (!active) {
        return;
      }
      await loadPrinters();
    };

    fetchInitial();
    const interval = window.setInterval(() => {
      loadPrinters();
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadPrinters]);

  const needsEmptying = useMemo(
    () => printers.filter((printer) => printer.needsEmptying),
    [printers],
  );

  const handleEmptied = async (printerId: string) => {
    try {
      setSavingId(printerId);
      await fetchJson<{ ok: boolean }>("/api/printers/emptying", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerId, needsEmptying: false }),
      });
      setPrinters((prev) =>
        prev.map((printer) =>
          printer.id === printerId
            ? { ...printer, needsEmptying: false }
            : printer,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update printer status.",
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
          Printer Emptying
        </p>
        <h1 className="text-3xl font-semibold text-zinc-900">
          Finished prints
        </h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          Every minute we check if a print has finished. When a printer is done,
          it is marked as needing to be emptied until you confirm it.
        </p>
        {lastChecked ? (
          <p className="text-xs text-zinc-400">
            Last checked: {formatUpdated(lastChecked)}
          </p>
        ) : null}
      </header>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
          Loading printers...
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {printers.map((printer) => (
          <div
            key={printer.id}
            className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {printer.name || "Unnamed printer"}
                </h2>
                <p className="text-xs text-zinc-400">{printer.model}</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                  statusStyles[printer.status] ??
                  "bg-zinc-100 text-zinc-600 ring-zinc-200"
                }`}
              >
                {statusLabels[printer.status] ?? printer.status}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-zinc-500">
              <p>
                Job:{" "}
                <span className="text-zinc-700">{printer.jobName ?? "-"}</span>
              </p>
              <p>
                Progress:{" "}
                <span className="text-zinc-700">{printer.progress}%</span>
              </p>
              <p>
                Updated:{" "}
                <span className="text-zinc-700">
                  {formatUpdated(printer.updatedAt)}
                </span>
              </p>
            </div>

            {printer.needsEmptying ? (
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span>Needs to be emptied</span>
                <button
                  type="button"
                  onClick={() => handleEmptied(printer.id)}
                  disabled={savingId === printer.id}
                  className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingId === printer.id ? "Updating..." : "Is emptied now"}
                </button>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                No emptying needed
              </div>
            )}
          </div>
        ))}
      </section>

      {!loading && printers.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-500">
          No printers found.
        </div>
      ) : null}

      {needsEmptying.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {needsEmptying.length} printer{needsEmptying.length === 1 ? "" : "s"}{" "}
          need to be emptied.
        </div>
      ) : null}
    </div>
  );
}
