"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getCartJobs,
  getCartProducts,
  setCartJobs,
  setCartProducts,
  type CartProduct,
} from "@/lib/cart";

type Job = {
  id: string;
  title: string;
  status: string;
  deviceId?: string;
  startTime?: string;
  endTime?: string;
  durationSeconds?: number;
  weightGrams?: number;
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

export default function CheckoutPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [descriptions, setDescriptions] = useState<
    Record<string, DescriptionEntry>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [descriptionsError, setDescriptionsError] = useState<string | null>(
    null,
  );
  const [cartJobIds, setCartJobIds] = useState<string[]>([]);
  const [cartProducts, setCartProductsState] = useState<CartProduct[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    title: "3D Print Offer",
    intro: "Thank you for your print order.",
    email: "",
    addressLine: "",
    zip: "",
    city: "",
    details1: "",
    details2: "",
  });
  const [priceRate, setPriceRate] = useState(4);

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
    let active = true;
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

    loadJobs();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cartJobIds.length === 0) {
      setDescriptions({});
      return;
    }

    const loadDescriptions = async () => {
      try {
        const params = new URLSearchParams({ jobIds: cartJobIds.join(",") });
        const data = await fetchJson<{
          descriptions: Record<string, DescriptionEntry>;
          currentUserId: string;
        }>(`/api/descriptions?${params.toString()}`);
        setDescriptions(data.descriptions ?? {});
        setCurrentUserId(data.currentUserId ?? null);
      } catch (error) {
        setDescriptionsError(
          error instanceof Error
            ? error.message
            : "Unable to load descriptions from Supabase.",
        );
      }
    };

    loadDescriptions();
  }, [cartJobIds]);

  const cartJobs = useMemo(
    () => jobs.filter((job) => cartJobIds.includes(job.id)),
    [jobs, cartJobIds],
  );

  const cartJobPositions = useMemo(() => {
    return cartJobs
      .map((job) => {
        const estimatedWeight = estimatePrintedWeight(
          job.weightGrams,
          job.durationSeconds,
          job.startTime,
          job.endTime,
          job.status,
        );
        const unitAmount = Math.round(
          ((estimatedWeight ?? 0) / 100) * priceRate * 100,
        );
        return {
          description: `${job.title} (${estimatedWeight ?? 0}g)`,
          quantity: 1,
          unitAmount,
          details: descriptions[job.id]?.description ?? "",
          jobId: job.id,
        };
      })
      .filter((position) => position.unitAmount > 0);
  }, [cartJobs, descriptions, priceRate]);

  const cartProductPositions = useMemo(() => {
    return cartProducts
      .map((product) => ({
        description: product.title,
        quantity: product.quantity ?? 1,
        unitAmount: product.unitAmount,
        details: product.details ?? "",
        productId: product.id,
      }))
      .filter((position) => position.unitAmount > 0 && position.quantity > 0);
  }, [cartProducts]);

  const cartSummary = useMemo(() => {
    const totalWeight = cartJobs.reduce((sum, job) => {
      const estimatedWeight = estimatePrintedWeight(
        job.weightGrams,
        job.durationSeconds,
        job.startTime,
        job.endTime,
        job.status,
      );
      return sum + (estimatedWeight ?? 0);
    }, 0);
    const jobsTotalCents = cartJobPositions.reduce(
      (sum, position) => sum + position.unitAmount * position.quantity,
      0,
    );
    const productsTotalCents = cartProductPositions.reduce(
      (sum, position) => sum + position.unitAmount * position.quantity,
      0,
    );
    return {
      totalWeight,
      jobsTotalCents,
      productsTotalCents,
      totalCents: jobsTotalCents + productsTotalCents,
    };
  }, [cartJobs, cartJobPositions, cartProductPositions]);

  const handleRemoveCartJob = (jobId: string) => {
    setCartJobIds((prev) => prev.filter((id) => id !== jobId));
  };

  const handleIncreaseProduct = (productId: string) => {
    setCartProductsState((prev) =>
      prev.map((item) =>
        item.id === productId
          ? { ...item, quantity: (item.quantity ?? 1) + 1 }
          : item,
      ),
    );
  };

  const handleDecreaseProduct = (productId: string) => {
    setCartProductsState((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (!existing) {
        return prev;
      }
      const nextQty = (existing.quantity ?? 1) - 1;
      if (nextQty <= 0) {
        return prev.filter((item) => item.id !== productId);
      }
      return prev.map((item) =>
        item.id === productId ? { ...item, quantity: nextQty } : item,
      );
    });
  };

  const handleClearCart = () => {
    setCartJobIds([]);
    setCartProductsState([]);
  };

  const handleInvoiceDraft = async () => {
    setInvoiceError(null);
    setInvoiceSuccess(null);
    if (cartJobPositions.length === 0 && cartProductPositions.length === 0) {
      return;
    }

    const missingAddress =
      !invoiceForm.addressLine || !invoiceForm.zip || !invoiceForm.city;
    if (missingAddress) {
      setInvoiceError("Please fill in address line, zip, and city.");
      return;
    }

    const allOwned = cartJobs.every((job) => {
      const ownerId = descriptions[job.id]?.ownerId ?? null;
      return ownerId && ownerId === currentUserId;
    });
    if (!allOwned) {
      setInvoiceError("All checkout print jobs must be claimed by you.");
      return;
    }

    const positions = [...cartJobPositions, ...cartProductPositions].map(
      ({ description, quantity, unitAmount, details }) => ({
        description,
        quantity,
        unitAmount,
        details,
      }),
    );

    if (positions.length === 0) {
      setInvoiceError("All checkout positions are zero amount.");
      return;
    }

    setCreatingInvoice(true);
    try {
      const response = await fetchJson<{ id: string | null }>(
        "/api/campai/offer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: invoiceForm.title,
            intro: invoiceForm.intro,
            email: invoiceForm.email || undefined,
            address: {
              country: "DE",
              zip: invoiceForm.zip,
              city: invoiceForm.city,
              addressLine: invoiceForm.addressLine,
              details1: invoiceForm.details1 || undefined,
              details2: invoiceForm.details2 || undefined,
            },
            positions,
          }),
        },
      );
      setInvoiceSuccess(
        response.id ? `Draft created (ID: ${response.id}).` : "Draft created.",
      );
    } catch (error) {
      setInvoiceError(
        error instanceof Error
          ? error.message
          : "Unable to create invoice draft.",
      );
    } finally {
      setCreatingInvoice(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Review cart items and create a Campai invoice draft.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClearCart}
          className="rounded-full border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600"
        >
          Clear cart
        </button>
      </header>

      {jobsError ? <p className="text-sm text-rose-600">{jobsError}</p> : null}
      {descriptionsError ? (
        <p className="text-sm text-rose-600">{descriptionsError}</p>
      ) : null}

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Cart summary</h2>
        <p className="mt-2 text-xs text-zinc-500">
          {cartJobs.length} print(s) • {cartProducts.length} product(s)
        </p>
        <p className="mt-2 text-base font-semibold text-zinc-900">
          €{(cartSummary.totalCents / 100).toFixed(2)} total
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Prints estimate: {cartSummary.totalWeight}g • €
          {(cartSummary.jobsTotalCents / 100).toFixed(2)} at {priceRate}€/100g
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Products: €{(cartSummary.productsTotalCents / 100).toFixed(2)}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Offer title
            </label>
            <input
              className="w-full rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={invoiceForm.title}
              onChange={(event) =>
                setInvoiceForm((prev) => ({
                  ...prev,
                  title: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Contact email
            </label>
            <input
              className="w-full rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={invoiceForm.email}
              onChange={(event) =>
                setInvoiceForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Intro
            </label>
            <textarea
              className="min-h-[96px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={invoiceForm.intro}
              onChange={(event) =>
                setInvoiceForm((prev) => ({
                  ...prev,
                  intro: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Recipient name
            </label>
            <input
              className="w-full rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={invoiceForm.details1}
              onChange={(event) =>
                setInvoiceForm((prev) => ({
                  ...prev,
                  details1: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Address line
            </label>
            <input
              className="w-full rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={invoiceForm.addressLine}
              onChange={(event) =>
                setInvoiceForm((prev) => ({
                  ...prev,
                  addressLine: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              ZIP
            </label>
            <input
              className="w-full rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={invoiceForm.zip}
              onChange={(event) =>
                setInvoiceForm((prev) => ({
                  ...prev,
                  zip: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              City
            </label>
            <input
              className="w-full rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={invoiceForm.city}
              onChange={(event) =>
                setInvoiceForm((prev) => ({
                  ...prev,
                  city: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Country
            </label>
            <div className="w-full rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              DE
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Price rate €/100g
            </label>
            <select
              className="w-full rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={priceRate}
              onChange={(event) => setPriceRate(Number(event.target.value))}
            >
              <option value={3}>3 €/100g</option>
              <option value={4}>4 €/100g</option>
              <option value={5}>5 €/100g</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleInvoiceDraft}
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            disabled={creatingInvoice}
          >
            {creatingInvoice ? "Creating draft..." : "Create invoice draft"}
          </button>
          {invoiceError ? (
            <p className="text-sm text-rose-600">{invoiceError}</p>
          ) : null}
          {invoiceSuccess ? (
            <p className="text-sm text-emerald-700">{invoiceSuccess}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Cart items</h2>
        <div className="mt-4 space-y-3">
          {cartJobs.length === 0 && cartProducts.length === 0 ? (
            <p className="text-sm text-zinc-500">Cart is empty.</p>
          ) : null}
          {cartJobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {job.title}
                </p>
                <p className="text-xs text-zinc-500">
                  {formatPriceRange(
                    estimatePrintedWeight(
                      job.weightGrams,
                      job.durationSeconds,
                      job.startTime,
                      job.endTime,
                      job.status,
                    ),
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">
                  {getJobStatusLabel(job.status)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveCartJob(job.id)}
                  className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {cartProducts.map((product) => (
            <div
              key={`product-${product.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4"
            >
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {product.title}
                </p>
                <p className="text-xs text-zinc-500">
                  {product.unitAmount > 0
                    ? `€${(product.unitAmount / 100).toFixed(2)}`
                    : "Preis auf Anfrage"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDecreaseProduct(product.id)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600"
                >
                  −
                </button>
                <span className="text-xs text-zinc-600">
                  {product.quantity ?? 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleIncreaseProduct(product.id)}
                  className="rounded-full border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
