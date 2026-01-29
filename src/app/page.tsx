"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";

import { type PrinterStatus } from "@/lib/bambu";
import {
  getCartJobs,
  getCartProducts,
  setCartJobs,
  setCartProducts,
  type CartProduct,
} from "@/lib/cart";

const statusStyles: Record<PrinterStatus, string> = {
  idle: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  printing: "bg-blue-50 text-blue-700 ring-blue-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  offline: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
};

const statusLabels: Record<PrinterStatus, string> = {
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

const formatDuration = (seconds?: number) => {
  if (!seconds || seconds <= 0) {
    return "-";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const parseDateMs = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
};

const getJobStatusLabel = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "2" || normalized === "success") {
    return "Success";
  }
  if (normalized === "1" || normalized === "printing") {
    return "Printing";
  }
  if (
    ["3", "4", "failed", "error", "canceled", "cancelled", "aborted"].includes(
      normalized,
    )
  ) {
    return "Failed";
  }
  return status;
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

  const statusLabel = status ? getJobStatusLabel(status) : "";
  const isFailed = statusLabel === "Failed";
  if (!isFailed) {
    return weightGrams;
  }

  const startMs = parseDateMs(startTime);
  const endMs = parseDateMs(endTime);
  const actualSeconds =
    startMs && endMs && endMs > startMs
      ? Math.max(0, Math.round((endMs - startMs) / 1000))
      : undefined;
  const expectedSeconds = durationSeconds ?? undefined;

  if (!actualSeconds || !expectedSeconds || expectedSeconds <= 0) {
    return Math.max(0, Math.round(weightGrams * 0.5));
  }

  const ratio = Math.min(1, Math.max(0, actualSeconds / expectedSeconds));
  return Math.max(0, Math.round(weightGrams * ratio));
};

const formatPriceRange = (weightGrams?: number) => {
  if (!weightGrams) {
    return "-";
  }

  const priceLow = (weightGrams / 100) * 3;
  const priceHigh = (weightGrams / 100) * 5;
  return `€${priceLow.toFixed(2)}–€${priceHigh.toFixed(2)}`;
};

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

export const dynamic = "force-dynamic";

type Printer = {
  id: string;
  name: string;
  model: string;
  serial: string;
  status: PrinterStatus;
  progress: number;
  jobName?: string;
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
  const [jobs, setJobs] = useState<Job[]>([]);
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

  useEffect(() => {
    let active = true;

    const loadPrinters = async () => {
      try {
        const data = await fetchJson<{ printers: Printer[] }>(
          "/api/bambu/printers",
        );
        if (active) {
          setPrinters(data.printers ?? []);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to fetch printers from BambuLab cloud.",
          );
        }
      }
    };

    const loadJobs = async () => {
      try {
        const data = await fetchJson<{ jobs: Job[] }>("/api/bambu/jobs");
        if (active) {
          setJobs(data.jobs ?? []);
        }
      } catch (error) {
        if (active) {
          setJobsError(
            error instanceof Error
              ? error.message
              : "Unable to fetch print jobs from BambuLab cloud.",
          );
        }
      }
    };

    loadPrinters();
    loadJobs();

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

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <img
                src="/konglodigital-logo.svg"
                alt="KongloDigital"
                className="mb-3 h-16 w-auto"
              />
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Konglomerat Digitale Werkstätten
              </h1>
              <p className="mt-2 max-w-2xl text-base text-zinc-600">
                Live view of all 3D-printers at Konglomerat. Claim your prints
                and generate invoices.
              </p>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            <p className="font-semibold">Cloud connection failed</p>
            <p className="mt-2">{errorMessage}</p>
            <p className="mt-2">
              Ensure your BambuLab credentials and access token are configured
              in .env.local.
            </p>
          </section>
        ) : null}

        <section className="grid gap-6 md:grid-cols-2">
          {printers.map((printer) => (
            <article
              key={printer.id}
              className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  {getPrinterImage(printer.name) ? (
                    <img
                      src={getPrinterImage(printer.name)?.url}
                      alt={getPrinterImage(printer.name)?.alt}
                      className="h-16 w-16 rounded-xl border border-zinc-200 object-cover"
                    />
                  ) : null}
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {printer.name}
                    </h2>
                    <p className="text-sm text-zinc-500">
                      {printer.model} • {printer.serial}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    statusStyles[printer.status]
                  }`}
                >
                  {statusLabels[printer.status]}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-zinc-600">
                  <span>Job progress</span>
                  <span className="font-medium text-zinc-900">
                    {printer.progress}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.45)] transition-all"
                    style={{ width: `${printer.progress}%` }}
                  />
                </div>
                <div className="flex flex-col gap-1 text-sm text-zinc-600">
                  <span>Current job: {printer.jobName ?? "No active job"}</span>
                  <span>Last update: {formatUpdated(printer.updatedAt)}</span>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-zinc-900">
                Recent print jobs
              </h3>
              <p className="text-sm text-zinc-500">{jobs.length} jobs</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleAll}
                className="rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600"
              >
                {selectedJobIds.length === jobs.length
                  ? "Clear selection"
                  : "Select all"}
              </button>
              <button
                type="button"
                onClick={handleClaimSelected}
                className="rounded-full bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                disabled={selectedJobIds.length === 0}
              >
                Claim selected
              </button>
              <button
                type="button"
                onClick={handleAddSelectedToCart}
                className="rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600"
                disabled={selectedJobIds.length === 0}
              >
                Add selected to checkout
              </button>
              <Link
                href="/checkout"
                className="rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600"
              >
                Checkout ({cartJobIds.length + cartProducts.length})
              </Link>
            </div>
          </div>

          {claimMessage ? (
            <p className="mt-4 text-sm text-zinc-600">{claimMessage}</p>
          ) : null}

          {cartMessage ? (
            <p className="mt-2 text-sm text-zinc-600">{cartMessage}</p>
          ) : null}

          {jobsError ? (
            <p className="mt-4 text-sm text-rose-600">{jobsError}</p>
          ) : descriptionsError ? (
            <p className="mt-4 text-sm text-rose-600">{descriptionsError}</p>
          ) : jobs.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No jobs found.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4"
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
                    const statusLabel = getJobStatusLabel(job.status);
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
                            <div className="w-28 shrink-0 self-start aspect-square">
                              {job.imageUrl ? (
                                <img
                                  src={job.imageUrl}
                                  alt={`${job.title} preview`}
                                  className="h-full w-full rounded-2xl border border-zinc-200 object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white text-[10px] font-semibold uppercase text-zinc-400">
                                  No image
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-xs text-zinc-500">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleJob(job.id)}
                                  className="h-4 w-4 rounded border-zinc-300"
                                />
                                Select
                              </label>
                              <div>
                                <p className="text-sm font-semibold text-zinc-900">
                                  {job.title}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  Status: {statusLabel}
                                  {job.mode ? ` • ${job.mode}` : ""}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                                <span>Device: {job.deviceId ?? "-"}</span>
                                <span>
                                  Start:{" "}
                                  {job.startTime
                                    ? formatUpdated(job.startTime)
                                    : "-"}
                                </span>
                                <span>
                                  End:{" "}
                                  {job.endTime
                                    ? formatUpdated(job.endTime)
                                    : "-"}
                                </span>
                                <span>
                                  Weight:{" "}
                                  {job.weightGrams
                                    ? `${job.weightGrams}g`
                                    : "-"}
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
                                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                                  Description
                                </label>
                                {ownerId ? (
                                  <p className="text-xs text-zinc-400">
                                    Owner:{" "}
                                    {ownerId === currentUserId
                                      ? "You"
                                      : ownerId}
                                  </p>
                                ) : (
                                  <p className="text-xs text-emerald-600">
                                    Unclaimed — save to claim this print.
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    name="description"
                                    defaultValue={description}
                                    placeholder="Add a short description"
                                    maxLength={160}
                                    className="flex-1 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm"
                                    disabled={!canEdit}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
                                    disabled={!canEdit}
                                  >
                                    {savingJobId === job.id
                                      ? "Saving..."
                                      : ownerId
                                        ? "Update"
                                        : "Claim & Save"}
                                  </button>
                                </div>
                                {saveError && saveErrorJobId === job.id ? (
                                  <p className="text-xs text-rose-500">
                                    {saveError}
                                  </p>
                                ) : null}
                                {!canEdit ? (
                                  <p className="text-xs text-rose-500">
                                    You can view this description, but only the
                                    owner can edit it.
                                  </p>
                                ) : null}
                              </form>
                            </div>
                            <div className="flex flex-col items-end gap-2 self-start">
                              <div className="flex items-center gap-3">
                                <div className="text-xs text-zinc-500">
                                  Duration:{" "}
                                  {formatDuration(job.durationSeconds)}
                                </div>
                                <div className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-semibold text-white">
                                  {priceRange}
                                </div>
                              </div>
                              {isOwnedByUser ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCartJob(job.id)}
                                    className={
                                      isInCart
                                        ? "rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                                        : "rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700"
                                    }
                                  >
                                    {isInCart
                                      ? "Remove from checkout"
                                      : "Add to checkout"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUnclaimJob(job.id)}
                                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600"
                                    disabled={unclaimingJobId === job.id}
                                  >
                                    {unclaimingJobId === job.id
                                      ? "Unclaiming..."
                                      : "Unclaim"}
                                  </button>
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

        <section className="rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-6 text-sm text-zinc-600">
          <h3 className="text-base font-semibold text-zinc-900">Next steps</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Set BambuLab cloud credentials in .env.local.</li>
            <li>Consider polling or caching if you have many printers.</li>
            <li>Store printer metadata in a database for history tracking.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
