"use client";

import { useMemo, useState } from "react";
import {
  faArrowsRotate,
  faCloudArrowDown,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";
import PageTitle from "../components/PageTitle";

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
      <span className="inline-flex items-center rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success  ">
        paid
      </span>
    );
  }

  if (normalized === "unpaid") {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive-soft px-2.5 py-1 text-xs font-semibold text-destructive  ">
        unpaid
      </span>
    );
  }

  if (!paymentStatus) {
    return "-";
  }

  return (
    <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-foreground/80  ">
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
      <PageTitle
        title="Rechnungen"
        titleClassName=""
        links={[
          {
            href: "/invoices/new",
            label: "Neue Rechnung erstellen",
            kind: "primary",
            icon: faPlus,
          },
        ]}
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm  ">
        <table className="min-w-full divide-y divide-border ">
          <thead className="bg-muted/50 ">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ">
                Rechnungsnummer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ">
                Datum
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ">
                Betrag
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ">
                Empfänger
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ">
                Payment Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground ">
                Download
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border ">
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
                <td colSpan={6} className="px-4 py-8 text-sm text-destructive">
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
                  className="px-4 py-5 text-sm text-muted-foreground "
                >
                  Keine Rechnungen gefunden.
                </td>
              </tr>
            ) : (
              sortedInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground/90 ">
                    {invoice.receiptNumber || "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground/90 ">
                    {formatDate(invoice.receiptDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground/90 ">
                    {formatAmount(invoice)}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground/90 ">
                    {invoice.accountName || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground/90 ">
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
