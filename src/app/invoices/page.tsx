"use client";

import { useMemo, useState } from "react";
import {
  faArrowsRotate,
  faCloudArrowDown,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";

type InvoicePayload = {
  id: string;
  receiptNumber?: string;
  receiptDate?: string;
  totalGrossAmount?: number | null;
  currency?: string;
  accountName?: string;
  paymentStatus?: string;
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

const formatDate = (value?: string) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("de-DE", { dateStyle: "medium" });
};

const formatAmount = (invoice: InvoicePayload) => {
  if (typeof invoice.totalGrossAmount !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: invoice.currency || "EUR",
  }).format(invoice.totalGrossAmount / 100);
};

const renderPaymentBadge = (paymentStatus?: string) => {
  const normalized = paymentStatus?.trim().toLowerCase();

  if (normalized === "paid") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        paid
      </span>
    );
  }

  if (normalized === "unpaid") {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
        unpaid
      </span>
    );
  }

  if (!paymentStatus) {
    return "-";
  }

  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {paymentStatus}
    </span>
  );
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoicePayload[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetchJson<{ invoices: InvoicePayload[] }>(
        "/api/campai/invoices",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sort: { receiptDate: "desc" },
            limit: 100,
            invoiceType: "invoice",
          }),
        },
      );

      setInvoices(response.invoices ?? []);
      setHasLoaded(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Rechnungen konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  };

  const sortedInvoices = useMemo(
    () =>
      [...invoices].sort((left, right) => {
        const leftDate = left.receiptDate ? Date.parse(left.receiptDate) : 0;
        const rightDate = right.receiptDate ? Date.parse(right.receiptDate) : 0;
        return rightDate - leftDate;
      }),
    [invoices],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-0 md:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Rechnungen
        </h1>
        <Button href="/invoices/new" kind="primary" size="small" icon={faPlus}>
          Neue Rechnung erstellen
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Rechnungsnummer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Datum
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Betrag
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Empfänger
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Payment Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Download
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {!hasLoaded ? (
              <tr>
                <td colSpan={6} className="px-4 py-12">
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <Button
                      kind="secondary"
                      size="medium"
                      icon={faCloudArrowDown}
                      onClick={loadInvoices}
                      disabled={loading}
                      className="min-w-56"
                    >
                      {loading
                        ? "Rechnungen werden geladen …"
                        : "Rechnungen laden"}
                    </Button>
                  </div>
                </td>
              </tr>
            ) : errorMessage ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-sm text-rose-600">
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <span>{errorMessage}</span>
                    <Button
                      kind="secondary"
                      size="small"
                      icon={faArrowsRotate}
                      onClick={loadInvoices}
                    >
                      Erneut laden
                    </Button>
                  </div>
                </td>
              </tr>
            ) : sortedInvoices.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-5 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Keine Rechnungen gefunden.
                </td>
              </tr>
            ) : (
              sortedInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {invoice.receiptNumber || "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {formatDate(invoice.receiptDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {formatAmount(invoice)}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {invoice.accountName || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {renderPaymentBadge(invoice.paymentStatus)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Button
                      size="small"
                      onClick={() => {
                        window.location.href = `/api/campai/invoices/${invoice.id}/download`;
                      }}
                    >
                      Download
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
