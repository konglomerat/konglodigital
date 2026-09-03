"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { type PrinterStatus } from "@/lib/bambu";
import Button from "../components/Button";
import PageTitle from "../components/PageTitle";
import {
  getCartJobs,
  getCartProducts,
  setCartJobs,
  setCartProducts,
  type CartProduct,
} from "@/lib/cart";

const statusStyles: Record<PrinterStatus, string> = {
  idle: "bg-success-soft text-success",
  printing: "bg-primary-soft text-primary",
  paused: "bg-warning-soft text-warning",
  offline: "bg-warning-soft text-warning",
  error: "bg-destructive-soft text-destructive",
  unknown: "bg-warning-soft text-warning",
};

const statusLabels: Record<PrinterStatus, string> = {
  idle: "Bereit",
  printing: "Druckt",
  paused: "Pausiert",
  offline: "Offline",
  error: "Fehler",
  unknown: "Unbekannt",
};

const statusDotStyles: Record<PrinterStatus, string> = {
  idle: "bg-success",
  printing: "bg-primary animate-pulse",
  paused: "bg-warning",
  offline: "bg-warning",
  error: "bg-destructive",
  unknown: "bg-warning",
};

type JobStatusKind = "success" | "printing" | "failed" | "unknown";

const getJobStatusKind = (status: string): JobStatusKind => {
  const normalized = status.toLowerCase();
  if (normalized === "2" || normalized === "success") {
    return "success";
  }
  if (normalized === "1" || normalized === "printing") {
    return "printing";
  }
  if (
    ["3", "4", "failed", "error", "canceled", "cancelled", "aborted"].includes(
      normalized,
    )
  ) {
    return "failed";
  }
  return "unknown";
};

const jobStatusLabels: Record<JobStatusKind, string> = {
  success: "Erfolgreich",
  printing: "Druckt",
  failed: "Fehlgeschlagen",
  unknown: "Unbekannt",
};

const jobStatusStyles: Record<JobStatusKind, string> = {
  success: "bg-success-soft text-success",
  printing: "bg-primary-soft text-primary",
  failed: "bg-destructive-soft text-destructive",
  unknown: "bg-accent text-muted-foreground",
};

const jobStatusDotStyles: Record<JobStatusKind, string> = {
  success: "bg-success",
  printing: "bg-primary animate-pulse",
  failed: "bg-destructive",
  unknown: "bg-muted-foreground",
};

const formatUpdated = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) {
    return "-";
  }
  if (seconds < 60) {
    return "<1m";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const formatOperatingTime = (seconds: number) => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalMinutes === 0) {
    return "0 h";
  }
  if (hours === 0) {
    return `${minutes} min`;
  }
  return `${hours.toLocaleString("de-DE")} h${
    minutes ? ` ${minutes} min` : ""
  }`;
};

const formatOneDecimal = (value: number) =>
  value.toLocaleString("de-DE", {
    minimumFractionDigits: value < 10 ? 1 : 0,
    maximumFractionDigits: 1,
  });

const parseDateMs = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
};

const getJobStatusLabel = (status: string) =>
  jobStatusLabels[getJobStatusKind(status)];

const getElapsedSeconds = (startTime?: string, endTime?: string) => {
  const startMs = parseDateMs(startTime);
  const endMs = parseDateMs(endTime);
  return startMs && endMs && endMs > startMs
    ? Math.max(0, Math.round((endMs - startMs) / 1000))
    : undefined;
};

const estimatePrintedWeight = (
  weightGrams?: number,
  durationSeconds?: number,
  startTime?: string,
  endTime?: string,
  status?: string,
) => {
  if (!weightGrams) {
    return undefined;
  }

  const isFailed = getJobStatusKind(status ?? "") === "failed";
  if (!isFailed) {
    return weightGrams;
  }

  const actualSeconds = getElapsedSeconds(startTime, endTime);
  const expectedSeconds = durationSeconds ?? undefined;

  if (!actualSeconds || !expectedSeconds || expectedSeconds <= 0) {
    return undefined;
  }

  const ratio = Math.min(1, Math.max(0, actualSeconds / expectedSeconds));
  return Math.min(
    weightGrams,
    Math.max(0, Math.round(weightGrams * ratio * 100) / 100),
  );
};

const formatPriceRange = (weightGrams?: number) => {
  if (!weightGrams) {
    return "-";
  }

  const priceLow = (weightGrams / 100) * 3;
  const priceHigh = (weightGrams / 100) * 5;
  return `€${priceLow.toFixed(2)}–€${priceHigh.toFixed(2)}`;
};

const getInactiveStatusMessage = (status: PrinterStatus) => {
  switch (status) {
    case "idle":
      return "Bereit für den nächsten Druck.";
    case "offline":
      return "Der Drucker ist in der Bambu Cloud nicht erreichbar.";
    case "unknown":
      return "Der aktuelle Betriebszustand konnte nicht eindeutig ermittelt werden.";
    default:
      return undefined;
  }
};

const getPrinterBadgeDetail = (printer: Printer) => {
  const details: string[] = [];
  if (printer.statusDetail) {
    details.push(printer.statusDetail);
  }
  if (printer.rawStatus && ["error", "unknown"].includes(printer.status)) {
    details.push(`Bambu-Status: ${printer.rawStatus}`);
  }
  if (printer.statusStale && printer.statusObservedAt) {
    details.push(
      `Letzte Live-Meldung: ${formatUpdated(printer.statusObservedAt)}`,
    );
  }
  return details.join(" · ") || undefined;
};

const formatJobName = (jobName?: string) => {
  if (!jobName) {
    return undefined;
  }
  const fileName = jobName.split(/[\\/]/).at(-1) ?? jobName;
  return fileName.replace(/\.(gcode|3mf)$/i, "");
};

function StatusBadge({
  label,
  className,
  dotClassName,
  detail,
}: {
  label: string;
  className: string;
  dotClassName: string;
  detail?: string;
}) {
  return (
    <span
      className={`group relative inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${className} ${
        detail ? "cursor-help outline-none focus-visible:shadow-md" : ""
      }`}
      tabIndex={detail ? 0 : undefined}
      aria-label={detail ? `${label}. ${detail}` : label}
    >
      <span className={`h-2 w-2 rounded-full ${dotClassName}`} />
      {label}
      {detail ? (
        <>
          <span aria-hidden="true" className="text-[10px] opacity-70">
            ⓘ
          </span>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-border bg-popover px-3 py-2 text-left text-xs font-normal leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100"
          >
            {detail}
          </span>
        </>
      ) : null}
    </span>
  );
}

const printerImages: Array<{
  match: (name: string) => boolean;
  url: string;
  alt: string;
}> = [
  {
    match: (name) => /p1s\s*mit\s*ams|p1s\s*combo|p1s\s*with\s*ams/i.test(name),
    url: "https://www.polyfab3d.de/8677-pdt_540/starter-pack-bambu-lab-p1s-combo-mit-ams.jpg",
    alt: "Bambu Lab P1S Combo with AMS",
  },
  {
    match: (name) => /p1s\s*ohne\s*ams/i.test(name),
    url: "https://www.polyfab3d.de/9157-pdt_540/bambu-lab-ps1.jpg",
    alt: "Bambu Lab P1S",
  },
  {
    match: (name) => /h2d\s*mit\s*ams|h2d\s*combo/i.test(name),
    url: "https://www.polyfab3d.de/12526-pdt_540/bambu-lab-h2d-combo.jpg",
    alt: "Bambu Lab H2D Combo with AMS",
  },
  {
    match: (name) => /a1\s*mini/i.test(name),
    url: "https://www.polyfab3d.de/14537-pdt_540/bambu-lab-a1-mini.jpg",
    alt: "Bambu Lab A1 Mini",
  },
];

const getPrinterImage = (name: string) =>
  printerImages.find((entry) => entry.match(name));

type Printer = {
  id: string;
  name: string;
  model: string;
  serial: string;
  status: PrinterStatus;
  progress: number;
  jobName?: string;
  statusDetail?: string;
  rawStatus?: string;
  remainingMinutes?: number;
  currentLayer?: number;
  totalLayers?: number;
  statusSource?: "live" | "cloud" | "unavailable";
  statusObservedAt?: string;
  statusStale?: boolean;
  updatedAt: string;
};

type Job = {
  id: string;
  title: string;
  status: string;
  deviceId?: string;
  startTime?: string;
  endTime?: string;
  durationSeconds?: number;
  weightGrams?: number;
  mode?: string;
  imageUrl?: string;
  errorDetail?: string;
};

type PrinterUsageStats = {
  deviceId: string;
  deviceName?: string;
  seconds: number;
  timedJobs: number;
};

type PrintUsageStats = {
  totalSeconds: number;
  timedJobs: number;
  totalJobs: number;
  reportedTotalJobs: number;
  historyComplete: boolean;
  oldestStartTime?: string;
  byPrinter: PrinterUsageStats[];
};

type DescriptionEntry = {
  description: string;
  ownerId: string | null;
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

export default function Home() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [printersLoading, setPrintersLoading] = useState(true);
  const [printersRefreshing, setPrintersRefreshing] = useState(false);
  const [lastPrinterRefreshAt, setLastPrinterRefreshAt] = useState<
    string | null
  >(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [usageStats, setUsageStats] = useState<PrintUsageStats | null>(null);
  const [descriptions, setDescriptions] = useState<
    Record<string, DescriptionEntry>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [descriptionsError, setDescriptionsError] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorJobId, setSaveErrorJobId] = useState<string | null>(null);
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [unclaimingJobId, setUnclaimingJobId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [cartJobIds, setCartJobIds] = useState<string[]>([]);
  const [cartProducts, setCartProductsState] = useState<CartProduct[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const printerRequestRef = useRef<Promise<void> | null>(null);

  const loadDescriptions = async (jobIds: string[]) => {
    if (jobIds.length === 0) {
      setDescriptions({});
      return;
    }
    const params = new URLSearchParams({ jobIds: jobIds.join(",") });
    const data = await fetchJson<{
      descriptions: Record<string, DescriptionEntry>;
      currentUserId: string;
    }>(`/api/descriptions?${params.toString()}`);
    setDescriptions(data.descriptions ?? {});
    setCurrentUserId(data.currentUserId ?? null);
  };

  const refreshPrinters = useCallback((initial = false) => {
    if (printerRequestRef.current) {
      return printerRequestRef.current;
    }

    const request = (async () => {
      if (initial) {
        setPrintersLoading(true);
      } else {
        setPrintersRefreshing(true);
      }
      try {
        const data = await fetchJson<{ printers: Printer[] }>(
          "/api/bambu/printers",
          { cache: "no-store" },
        );
        const nextPrinters = data.printers ?? [];
        setPrinters(nextPrinters);
        setLastPrinterRefreshAt(
          nextPrinters[0]?.updatedAt ?? new Date().toISOString(),
        );
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Druckerstatus konnte nicht von Bambu Lab geladen werden.",
        );
      } finally {
        setPrintersLoading(false);
        setPrintersRefreshing(false);
      }
    })();

    printerRequestRef.current = request;
    void request.finally(() => {
      if (printerRequestRef.current === request) {
        printerRequestRef.current = null;
      }
    });
    return request;
  }, []);

  useEffect(() => {
    void refreshPrinters(true);
    const refreshInterval = window.setInterval(() => {
      void refreshPrinters();
    }, 20_000);

    return () => window.clearInterval(refreshInterval);
  }, [refreshPrinters]);

  useEffect(() => {
    let active = true;
    const loadJobs = async () => {
      if (active) {
        setJobsLoading(true);
      }
      try {
        const data = await fetchJson<{
          jobs: Job[];
          usageStats: PrintUsageStats;
        }>("/api/bambu/jobs?includeUsage=1");
        if (active) {
          setJobs(data.jobs ?? []);
          setUsageStats(data.usageStats ?? null);
          setJobsError(null);
        }
      } catch (error) {
        if (active) {
          setJobsError(
            error instanceof Error
              ? error.message
              : "Unable to fetch print jobs from BambuLab cloud.",
          );
        }
      } finally {
        if (active) {
          setJobsLoading(false);
        }
      }
    };

    void loadJobs();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setCartJobIds(getCartJobs());
    setCartProductsState(getCartProducts());
    setCartLoaded(true);
  }, []);

  useEffect(() => {
    if (!cartLoaded) {
      return;
    }
    setCartJobs(cartJobIds);
  }, [cartJobIds, cartLoaded]);

  useEffect(() => {
    if (!cartLoaded) {
      return;
    }
    setCartProducts(cartProducts);
  }, [cartProducts, cartLoaded]);

  useEffect(() => {
    if (jobs.length === 0) {
      return;
    }

    loadDescriptions(jobs.map((job) => job.id)).catch((error) => {
      setDescriptionsError(
        error instanceof Error
          ? error.message
          : "Unable to load descriptions from Supabase.",
      );
    });
  }, [jobs]);

  const handleSaveDescription = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setSaveError(null);
    setSaveErrorJobId(null);

    const formData = new FormData(event.currentTarget);
    const jobId = String(formData.get("jobId") ?? "");
    const description = String(formData.get("description") ?? "");

    setSavingJobId(jobId);
    try {
      await fetchJson<{ ok: boolean }>("/api/descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, description }),
      });
      await loadDescriptions(jobs.map((job) => job.id));
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save description.",
      );
      setSaveErrorJobId(jobId);
    } finally {
      setSavingJobId(null);
    }
  };

  const handleToggleJob = (jobId: string) => {
    setSelectedJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId],
    );
  };

  const handleToggleAll = () => {
    if (selectedJobIds.length === jobs.length) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(jobs.map((job) => job.id));
    }
  };

  const handleToggleCartJob = (jobId: string) => {
    setCartJobIds((prev) =>
      prev.includes(jobId)
        ? prev.filter((id) => id !== jobId)
        : [...prev, jobId],
    );
  };

  const handleAddSelectedToCart = () => {
    setCartMessage(null);
    if (selectedJobIds.length === 0) {
      return;
    }

    const ownedSelected = selectedJobIds.filter((jobId) => {
      const ownerId = descriptions[jobId]?.ownerId ?? null;
      return ownerId && ownerId === currentUserId;
    });

    const skippedCount = selectedJobIds.length - ownedSelected.length;
    if (ownedSelected.length === 0) {
      setCartMessage("Only claimed prints can be added to checkout.");
      return;
    }

    setCartJobIds((prev) => {
      const next = new Set(prev);
      ownedSelected.forEach((jobId) => next.add(jobId));
      return Array.from(next);
    });

    setCartMessage(
      `Added ${ownedSelected.length} print(s) to checkout.` +
        (skippedCount > 0 ? ` ${skippedCount} skipped.` : ""),
    );
  };

  const handleClaimSelected = async () => {
    setClaimMessage(null);
    if (selectedJobIds.length === 0) {
      return;
    }
    try {
      const data = await fetchJson<{
        claimed: string[];
        skipped: { jobId: string; reason: string }[];
      }>("/api/descriptions/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: selectedJobIds }),
      });
      await loadDescriptions(jobs.map((job) => job.id));
      const claimedCount = data.claimed.length;
      const skippedCount = data.skipped.length;
      setClaimMessage(
        `Claimed ${claimedCount} print(s). ${
          skippedCount > 0 ? `${skippedCount} skipped.` : ""
        }`,
      );
    } catch (error) {
      setClaimMessage(
        error instanceof Error
          ? error.message
          : "Unable to claim selected prints.",
      );
    }
  };

  const handleUnclaimJob = async (jobId: string) => {
    setClaimMessage(null);
    setUnclaimingJobId(jobId);
    try {
      await fetchJson<{ ok: boolean }>("/api/descriptions/unclaim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      setCartJobIds((prev) => prev.filter((id) => id !== jobId));
      await loadDescriptions(jobs.map((job) => job.id));
      setClaimMessage("Unclaimed 1 print.");
    } catch (error) {
      setClaimMessage(
        error instanceof Error
          ? error.message
          : "Unable to unclaim this print.",
      );
    } finally {
      setUnclaimingJobId(null);
    }
  };

  const cloudErrors = [errorMessage, jobsError].filter(
    (message): message is string => Boolean(message),
  );
  const hasAuthenticationError = cloudErrors.some((message) =>
    /\b401\b|unauthorized|verification email|access token|login failed/i.test(
      message,
    ),
  );
  const showJobsError =
    Boolean(jobsError) &&
    !hasAuthenticationError &&
    jobsError !== errorMessage;
  const usageByPrinter = new Map(
    (usageStats?.byPrinter ?? []).map((entry) => [entry.deviceId, entry]),
  );
  const currentPrinterIds = new Set(printers.map((printer) => printer.id));
  const rankedPrinterUsage = [
    ...printers.map((printer) => ({
      deviceId: printer.id,
      name: printer.name,
      seconds: usageByPrinter.get(printer.id)?.seconds ?? 0,
      timedJobs: usageByPrinter.get(printer.id)?.timedJobs ?? 0,
    })),
    ...(usageStats?.byPrinter ?? [])
      .filter((entry) => !currentPrinterIds.has(entry.deviceId))
      .map((entry) => ({
        deviceId: entry.deviceId,
        name: entry.deviceName ?? `Drucker …${entry.deviceId.slice(-6)}`,
        seconds: entry.seconds,
        timedJobs: entry.timedJobs,
      })),
  ].sort((left, right) => right.seconds - left.seconds);
  const topPrinterSeconds = rankedPrinterUsage[0]?.seconds ?? 0;
  const marathonDays = (usageStats?.totalSeconds ?? 0) / (60 * 60 * 24);
  const coffeeBreaks = Math.round((usageStats?.totalSeconds ?? 0) / (15 * 60));

  return (
    <div className="min-h-screen text-foreground">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <PageTitle
          title="3D-Druck"
          subTitle="Druckerstatus, letzte Druckaufträge und Abrechnung auf einen Blick."
          links={[
            {
              href: "/printers/emptying",
              label: "Drucker entleeren",
            },
            {
              href: "/printers/access-codes",
              label: "Zugangscodes",
            },
          ]}
        />

        {hasAuthenticationError ? (
          <section className="rounded-lg border border-destructive-border bg-destructive-soft p-6 text-sm text-destructive">
            <p className="font-semibold">
              Bambu Lab-Verbindung konnte nicht erneuert werden
            </p>
            <p className="mt-2">
              Das hinterlegte Cloud-Token ist abgelaufen und Bambu Lab hat noch
              keine neue Bestätigungs-E-Mail zugestellt. Sobald der Code unter
              Zugangscodes erscheint, wird das Token beim nächsten Versuch
              automatisch erneuert und dauerhaft gespeichert.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                kind="secondary"
                className="w-fit border-destructive-border bg-card text-destructive hover:bg-destructive-soft"
                onClick={() => window.location.reload()}
              >
                Erneut versuchen
              </Button>
              <Button
                href="/printers/access-codes"
                kind="secondary"
                className="w-fit border-destructive-border bg-card text-destructive hover:bg-destructive-soft"
              >
                Zugangscodes öffnen
              </Button>
            </div>
          </section>
        ) : errorMessage ? (
          <section className="rounded-lg border border-destructive-border bg-destructive-soft p-6 text-sm text-destructive">
            <p className="font-semibold">Cloud-Verbindung fehlgeschlagen</p>
            <p className="mt-2">{errorMessage}</p>
          </section>
        ) : null}

        <section aria-labelledby="printer-status-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="printer-status-heading"
                className="text-lg font-semibold text-foreground"
              >
                Druckerstatus
              </h2>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {printersRefreshing
                  ? "Live-Status wird aktualisiert …"
                  : lastPrinterRefreshAt
                    ? `Automatisch alle 20 Sekunden · zuletzt geprüft ${formatUpdated(lastPrinterRefreshAt)}`
                    : "Live-Status wird geladen …"}
              </p>
            </div>
            <Button
              type="button"
              kind="secondary"
              onClick={() => void refreshPrinters()}
              disabled={printersLoading || printersRefreshing}
              className="px-3 py-2 text-xs"
            >
              {printersRefreshing ? "Aktualisiert …" : "Jetzt aktualisieren"}
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {printersLoading
              ? Array.from({ length: 4 }).map((_, index) => (
                <article
                  key={`printer-skeleton-${index}`}
                  className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-lg border border-border bg-accent animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-4 w-40 rounded-full bg-accent animate-pulse" />
                        <div className="h-3 w-32 rounded-full bg-accent animate-pulse" />
                      </div>
                    </div>
                    <div className="h-6 w-20 rounded-full bg-accent animate-pulse" />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span className="h-3 w-24 rounded-full bg-accent animate-pulse" />
                      <span className="h-3 w-10 rounded-full bg-accent animate-pulse" />
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
                      <div className="h-full w-2/3 rounded-full bg-accent animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="h-3 w-52 rounded-full bg-accent animate-pulse" />
                      <div className="h-3 w-36 rounded-full bg-accent animate-pulse" />
                    </div>
                  </div>
                </article>
                ))
              : printers.map((printer) => {
                  const hasActiveJob = ["printing", "paused", "error"].includes(
                    printer.status,
                  );
                  const inactiveMessage = getInactiveStatusMessage(
                    printer.status,
                  );
                  const badgeDetail = getPrinterBadgeDetail(printer);
                  const displayJobName = formatJobName(printer.jobName);
                  const sourceLabel = printer.statusStale
                    ? "Live-Status verzögert"
                    : printer.statusSource === "live"
                      ? "Live-Status"
                      : printer.statusSource === "cloud"
                        ? "Cloud-Status"
                        : "Status nicht verfügbar";
                  const printerUsage = usageByPrinter.get(printer.id);

                  return (
                    <article
                      key={printer.id}
                      className={`flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-sm transition-colors ${
                        printer.status === "error"
                          ? "border-destructive-border"
                          : "border-border"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-4">
                          {getPrinterImage(printer.name) ? (
                            <img
                              src={getPrinterImage(printer.name)?.url}
                              alt={getPrinterImage(printer.name)?.alt}
                              className="h-24 w-24 rounded-xl border border-border object-cover sm:h-28 sm:w-28"
                            />
                          ) : null}
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">
                              {printer.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {printer.model}
                            </p>
                            <p className="text-xs text-muted-foreground/80">
                              {printer.serial}
                            </p>
                          </div>
                        </div>
                        <StatusBadge
                          label={statusLabels[printer.status]}
                          className={statusStyles[printer.status]}
                          dotClassName={statusDotStyles[printer.status]}
                          detail={badgeDetail}
                        />
                      </div>

                      {hasActiveJob ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>Druckfortschritt</span>
                            <span className="font-semibold tabular-nums text-foreground">
                              {printer.progress}%
                            </span>
                          </div>
                          <div
                            className="h-2.5 w-full overflow-hidden rounded-full bg-accent"
                            role="progressbar"
                            aria-label={`Druckfortschritt ${printer.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={printer.progress}
                          >
                            <div
                              className={`h-full rounded-full transition-all ${
                                printer.status === "error"
                                  ? "bg-destructive"
                                  : printer.status === "paused"
                                    ? "bg-warning"
                                    : "bg-primary shadow-[0_0_10px_rgba(37,99,235,0.35)]"
                              }`}
                              style={{ width: `${printer.progress}%` }}
                            />
                          </div>
                          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                            <span className="sm:col-span-2">
                              <span className="font-medium text-foreground">
                                Aktueller Auftrag:
                              </span>{" "}
                              {displayJobName ?? "Nicht angegeben"}
                            </span>
                            {printer.remainingMinutes !== undefined ? (
                              <span>
                                Restzeit: ca. {printer.remainingMinutes} Min.
                              </span>
                            ) : null}
                            {printer.currentLayer !== undefined &&
                            printer.totalLayers !== undefined ? (
                              <span>
                                Ebene {printer.currentLayer} von{" "}
                                {printer.totalLayers}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : inactiveMessage ? (
                        <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                          {inactiveMessage}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary-soft/70 px-4 py-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                            Betriebsstunden · Druckzeit
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {jobsLoading
                              ? "Kilometerzähler wird abgelesen …"
                              : jobsError
                                ? "Zurzeit nicht verfügbar"
                                : `${printerUsage?.timedJobs ?? 0} ${
                                    printerUsage?.timedJobs === 1
                                      ? "Druckmission"
                                      : "Druckmissionen"
                                  }`}
                          </p>
                        </div>
                        <strong className="text-lg tabular-nums text-foreground">
                          {jobsLoading
                            ? "…"
                            : jobsError
                              ? "–"
                              : formatOperatingTime(printerUsage?.seconds ?? 0)}
                        </strong>
                      </div>

                      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                        <span
                          className={
                            printer.statusStale ? "text-warning" : undefined
                          }
                        >
                          {sourceLabel}
                        </span>
                        <span>Geprüft {formatUpdated(printer.updatedAt)}</span>
                      </div>
                    </article>
                  );
                })}
            {!printersLoading && !errorMessage && printers.length === 0 ? (
              <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground md:col-span-2">
                Keine Drucker gefunden.
              </div>
            ) : null}
          </div>
        </section>

        {jobsLoading ? (
          <section
            className="h-80 animate-pulse rounded-lg border border-border bg-card shadow-sm"
            aria-label="Betriebsstunden-Statistik wird geladen"
          />
        ) : usageStats ? (
          <section
            aria-labelledby="printer-usage-heading"
            className="overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary-soft via-card to-warning-soft shadow-sm"
          >
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="flex flex-col justify-between gap-8 p-6 sm:p-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
                    Die große Düsen-Olympiade
                  </p>
                  <h2
                    id="printer-usage-heading"
                    className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl"
                  >
                    Gemeinsam schon {formatOperatingTime(usageStats.totalSeconds)}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Würden alle Drucker nacheinander laufen, hieße es seit rund{" "}
                    {formatOneDecimal(marathonDays)} Tagen: „Nur noch schnell
                    diese eine Datei.“
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <div className="rounded-lg border border-border/70 bg-card/80 p-3">
                    <p className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">
                      {formatOneDecimal(marathonDays)}
                    </p>
                    <p className="mt-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">
                      Tage nonstop
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/80 p-3">
                    <p className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">
                      {coffeeBreaks.toLocaleString("de-DE")}
                    </p>
                    <p className="mt-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">
                      {coffeeBreaks === 1 ? "Kaffeepause" : "Kaffeepausen"} à
                      15 Min.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card/80 p-3">
                    <p className="text-xl font-bold tabular-nums text-foreground sm:text-2xl">
                      {usageStats.timedJobs.toLocaleString("de-DE")}
                    </p>
                    <p className="mt-1 text-[11px] leading-tight text-muted-foreground sm:text-xs">
                      {usageStats.timedJobs === 1
                        ? "Druckmission"
                        : "Druckmissionen"}{" "}
                      mit Stoppuhr
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/70 bg-card/65 p-6 sm:p-8 lg:border-l lg:border-t-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Düsen-Liga
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                      Wer hat die heißeste Ausdauer?
                    </h3>
                  </div>
                  <span className="text-3xl" aria-hidden="true">
                    🏁
                  </span>
                </div>

                <div className="mt-6 space-y-4">
                  {rankedPrinterUsage.map((entry, index) => {
                    const share =
                      topPrinterSeconds > 0
                        ? Math.max(2, (entry.seconds / topPrinterSeconds) * 100)
                        : 0;
                    return (
                      <div key={entry.deviceId}>
                        <div className="flex items-end justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground">
                              {entry.name}
                            </span>
                            {index === 0 && entry.seconds > 0 ? (
                              <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                                Düsen-Dauerläufer
                              </span>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              {`${entry.timedJobs.toLocaleString("de-DE")} ${
                                entry.timedJobs === 1 ? "Auftrag" : "Aufträge"
                              }`}
                            </p>
                          </div>
                          <strong className="shrink-0 tabular-nums text-foreground">
                            {formatOperatingTime(entry.seconds)}
                          </strong>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent">
                          <div
                            className="h-full rounded-full bg-primary transition-[width]"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p
              className={`border-t border-border/70 px-6 py-3 text-xs sm:px-8 ${
                usageStats.historyComplete
                  ? "text-muted-foreground"
                  : "bg-warning-soft text-warning"
              }`}
            >
              {usageStats.historyComplete
                ? `Betriebsstunden sind die summierte Druckzeit aus ${usageStats.timedJobs.toLocaleString("de-DE")} ${usageStats.timedJobs === 1 ? "Auftrag" : "Aufträgen"} der Bambu-Cloud-Historie – nicht bloße Einschaltzeit.`
                : `Mindestwerte: ${usageStats.totalJobs.toLocaleString("de-DE")} von ${usageStats.reportedTotalJobs.toLocaleString("de-DE")} Cloud-Aufträgen konnten geladen werden.`}
            </p>
          </section>
        ) : null}

        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Letzte Druckaufträge
              </h3>
              <p className="text-sm text-muted-foreground">
                {jobsLoading
                  ? "Wird geladen …"
                  : `${jobs.length} ${jobs.length === 1 ? "Auftrag" : "Aufträge"}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {jobs.length > 0 ? (
                <>
                  <Button
                    type="button"
                    onClick={handleToggleAll}
                    kind="secondary"
                  >
                    {selectedJobIds.length === jobs.length
                      ? "Auswahl aufheben"
                      : "Alle auswählen"}
                  </Button>
                  <Button
                    type="button"
                    onClick={handleClaimSelected}
                    kind="primary"
                    className="px-3 py-2 text-xs"
                    disabled={selectedJobIds.length === 0}
                  >
                    Auswahl übernehmen
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddSelectedToCart}
                    kind="secondary"
                    className="px-3 py-2 text-xs"
                    disabled={selectedJobIds.length === 0}
                  >
                    Zum Warenkorb hinzufügen
                  </Button>
                </>
              ) : null}
              <Button
                href="/checkout"
                kind="secondary"
                className="px-3 py-2 text-xs"
              >
                Warenkorb ({cartJobIds.length + cartProducts.length})
              </Button>
            </div>
          </div>

          {claimMessage ? (
            <p className="mt-4 text-sm text-muted-foreground">{claimMessage}</p>
          ) : null}

          {cartMessage ? (
            <p className="mt-2 text-sm text-muted-foreground">{cartMessage}</p>
          ) : null}

          {jobsLoading ? (
            <div
              className="mt-4 space-y-3"
              aria-label="Druckaufträge werden geladen"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`job-skeleton-${index}`}
                  className="h-24 animate-pulse rounded-lg border border-border/60 bg-muted/60"
                />
              ))}
            </div>
          ) : hasAuthenticationError ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Druckaufträge werden wieder angezeigt, sobald die Bambu
              Lab-Verbindung erneuert wurde.
            </p>
          ) : showJobsError ? (
            <p className="mt-4 text-sm text-destructive">{jobsError}</p>
          ) : descriptionsError ? (
            <p className="mt-4 text-sm text-destructive">{descriptionsError}</p>
          ) : jobs.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Keine Druckaufträge gefunden.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/60 p-4"
                >
                  {(() => {
                    const estimatedWeight = estimatePrintedWeight(
                      job.weightGrams,
                      job.durationSeconds,
                      job.startTime,
                      job.endTime,
                      job.status,
                    );
                    const priceRange = formatPriceRange(estimatedWeight);
                    const statusKind = getJobStatusKind(job.status);
                    const actualDuration = getElapsedSeconds(
                      job.startTime,
                      job.endTime,
                    );
                    const deviceName = printers.find(
                      (printer) => printer.id === job.deviceId,
                    )?.name;
                    const failureDetail =
                      statusKind === "failed"
                        ? job.errorDetail ??
                          `Bambu Lab meldet diesen Auftrag als fehlgeschlagen${
                            job.endTime
                              ? ` (beendet ${formatUpdated(job.endTime)})`
                              : ""
                          }. Ein genauerer Fehlergrund wurde nicht übermittelt.`
                        : undefined;
                    const descriptionEntry = descriptions[job.id] ?? null;
                    const description = descriptionEntry?.description ?? "";
                    const ownerId = descriptionEntry?.ownerId ?? null;
                    const canEdit =
                      !!currentUserId &&
                      (ownerId === null ||
                        ownerId === "" ||
                        ownerId === currentUserId);

                    const isSelected = selectedJobIds.includes(job.id);
                    const isOwnedByUser = ownerId === currentUserId;
                    const isInCart = cartJobIds.includes(job.id);

                    return (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-stretch gap-4">
                            <div className="aspect-[4/3] w-full shrink-0 self-start sm:aspect-square sm:w-40 lg:w-48">
                              {job.imageUrl ? (
                                <img
                                  src={job.imageUrl}
                                  alt={`${job.title} preview`}
                                  className="h-full w-full rounded-lg border border-border object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-input bg-card text-[10px] font-semibold uppercase text-muted-foreground/80">
                                  Kein Bild
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleJob(job.id)}
                                  className="h-4 w-4 rounded-md border-input"
                                />
                                Auswählen
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-foreground">
                                  {job.title}
                                </p>
                                <StatusBadge
                                  label={getJobStatusLabel(job.status)}
                                  className={jobStatusStyles[statusKind]}
                                  dotClassName={jobStatusDotStyles[statusKind]}
                                  detail={failureDetail}
                                />
                                {job.mode ? (
                                  <span className="text-xs text-muted-foreground">
                                    {job.mode}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                <span>
                                  Drucker: {deviceName ?? job.deviceId ?? "-"}
                                </span>
                                <span>
                                  Start:{" "}
                                  {job.startTime
                                    ? formatUpdated(job.startTime)
                                    : "-"}
                                </span>
                                <span>
                                  Ende:{" "}
                                  {job.endTime
                                    ? formatUpdated(job.endTime)
                                    : "-"}
                                </span>
                                <span>
                                  {statusKind === "failed"
                                    ? "Material (geschätzt)"
                                    : "Material"}
                                  :{" "}
                                  {estimatedWeight !== undefined
                                    ? `${estimatedWeight} g`
                                    : "-"}
                                  {statusKind === "failed" && job.weightGrams
                                    ? ` von ${job.weightGrams} g geplant`
                                    : ""}
                                </span>
                              </div>
                              <form
                                onSubmit={handleSaveDescription}
                                className="flex flex-col gap-2"
                              >
                                <input
                                  type="hidden"
                                  name="jobId"
                                  value={job.id}
                                />
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                                  Beschreibung
                                </label>
                                {ownerId ? (
                                  <p className="text-xs text-muted-foreground/80">
                                    Zugeordnet:{" "}
                                    {ownerId === currentUserId
                                      ? "Dir"
                                      : ownerId}
                                  </p>
                                ) : (
                                  <p className="text-xs text-success">
                                    Noch nicht zugeordnet — beim Speichern
                                    übernimmst du den Auftrag.
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    name="description"
                                    defaultValue={description}
                                    placeholder="Kurze Beschreibung hinzufügen"
                                    maxLength={160}
                                    className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground/80 shadow-sm"
                                    disabled={!canEdit}
                                  />
                                  <Button
                                    type="submit"
                                    kind="secondary"
                                    disabled={!canEdit}
                                  >
                                    {savingJobId === job.id
                                      ? "Speichert …"
                                      : ownerId
                                        ? "Speichern"
                                        : "Übernehmen & speichern"}
                                  </Button>
                                </div>
                                {saveError && saveErrorJobId === job.id ? (
                                  <p className="text-xs text-destructive">
                                    {saveError}
                                  </p>
                                ) : null}
                                {!canEdit ? (
                                  <p className="text-xs text-destructive">
                                    Nur die zugeordnete Person kann diese
                                    Beschreibung bearbeiten.
                                  </p>
                                ) : null}
                              </form>
                            </div>
                            <div className="flex flex-col items-end gap-2 self-start">
                              <div className="flex items-center gap-3">
                                <div className="text-xs text-muted-foreground">
                                  {statusKind === "failed"
                                    ? "Bis Abbruch"
                                    : "Druckzeit"}
                                  :{" "}
                                  {formatDuration(
                                    statusKind === "failed"
                                      ? (actualDuration ?? job.durationSeconds)
                                      : (job.durationSeconds ?? actualDuration),
                                  )}
                                  {statusKind === "failed" &&
                                  actualDuration !== undefined &&
                                  job.durationSeconds !== undefined
                                    ? ` · geplant ${formatDuration(job.durationSeconds)}`
                                    : ""}
                                </div>
                                <div
                                  className="rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background"
                                  title={
                                    statusKind === "failed"
                                      ? "Geschätzte Materialkosten bis zum Abbruch"
                                      : "Materialkosten"
                                  }
                                >
                                  {statusKind === "failed" && priceRange !== "-"
                                    ? `ca. ${priceRange}`
                                    : priceRange}
                                </div>
                              </div>
                              {isOwnedByUser ? (
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    onClick={() => handleToggleCartJob(job.id)}
                                    kind={
                                      isInCart
                                        ? "danger-secondary"
                                        : "secondary"
                                    }
                                    className={
                                      isInCart
                                        ? "px-3 py-1 text-xs"
                                        : "border-primary-border px-3 py-1 text-xs text-primary"
                                    }
                                  >
                                    {isInCart
                                      ? "Aus Warenkorb entfernen"
                                      : "Zum Warenkorb"}
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() => handleUnclaimJob(job.id)}
                                    kind="secondary"
                                    className="px-3 py-1 text-xs"
                                    disabled={unclaimingJobId === job.id}
                                  >
                                    {unclaimingJobId === job.id
                                      ? "Wird freigegeben …"
                                      : "Freigeben"}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
