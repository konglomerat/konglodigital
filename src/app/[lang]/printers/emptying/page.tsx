"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Button from "../../components/Button";
import PageTitle from "../../components/PageTitle";

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
  idle: "bg-success-soft text-success ring-success-border",
  printing: "bg-primary-soft text-primary ring-primary-border",
  paused: "bg-warning-soft text-warning ring-warning-border",
  offline: "bg-accent text-muted-foreground ring-ring",
  error: "bg-destructive-soft text-destructive ring-destructive-border",
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
        <PageTitle
          eyebrow="Printer Emptying"
          eyebrowClassName="text-xs tracking-[0.3em] text-muted-foreground/80"
          title="Finished prints"
          titleClassName="text-foreground"
          subTitle="Every minute we check if a print has finished. When a printer is done, it is marked as needing to be emptied until you confirm it."
          subTitleClassName="max-w-2xl text-muted-foreground"
          backLink={{
            href: "/printers/access-codes",
            label: "Zur Unterseite Zugangscodes",
          }}
        />
        {lastChecked ? (
          <p className="text-xs text-muted-foreground/80">
            Last checked: {formatUpdated(lastChecked)}
          </p>
        ) : null}
      </header>

      {errorMessage ? (
        <div className="rounded-2xl border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          Loading printers...
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {printers.map((printer) => (
          <div
            key={printer.id}
            className="rounded-3xl border border-border bg-card p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {printer.name || "Unnamed printer"}
                </h2>
                <p className="text-xs text-muted-foreground/80">{printer.model}</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                  statusStyles[printer.status] ??
                  "bg-accent text-muted-foreground ring-ring"
                }`}
              >
                {statusLabels[printer.status] ?? printer.status}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>
                Job:{" "}
                <span className="text-foreground/80">{printer.jobName ?? "-"}</span>
              </p>
              <p>
                Progress:{" "}
                <span className="text-foreground/80">{printer.progress}%</span>
              </p>
              <p>
                Updated:{" "}
                <span className="text-foreground/80">
                  {formatUpdated(printer.updatedAt)}
                </span>
              </p>
            </div>

            {printer.needsEmptying ? (
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning">
                <span>Needs to be emptied</span>
                <Button
                  type="button"
                  onClick={() => handleEmptied(printer.id)}
                  disabled={savingId === printer.id}
                  kind="secondary"
                  className="border-warning-border px-3 py-1 text-xs text-warning hover:bg-warning-soft"
                >
                  {savingId === printer.id ? "Updating..." : "Is emptied now"}
                </Button>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-success-border bg-success-soft px-4 py-3 text-sm text-success">
                No emptying needed
              </div>
            )}
          </div>
        ))}
      </section>

      {!loading && printers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          No printers found.
        </div>
      ) : null}

      {needsEmptying.length > 0 ? (
        <div className="rounded-2xl border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning">
          {needsEmptying.length} printer{needsEmptying.length === 1 ? "" : "s"}{" "}
          need to be emptied.
        </div>
      ) : null}
    </div>
  );
}
