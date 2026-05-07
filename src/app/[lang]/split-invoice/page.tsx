"use client";

import { useEffect, useState } from "react";
import { faArrowsRotate, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "../components/Button";
import type { MaterialOrderSummary } from "@/lib/material-orders";

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

const euroFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const formatDate = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("de-DE", { dateStyle: "medium" });
};

export default function MaterialbestellungListPage() {
  const [orders, setOrders] = useState<MaterialOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const response = await fetchJson<{ orders: MaterialOrderSummary[] }>(
        "/api/materialbestellung/orders",
      );
      setOrders(response.orders ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Materialbestellungen konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (order: MaterialOrderSummary) => {
    const label = order.supplierInvoiceNumber || order.supplierName || order.id;
    if (!window.confirm(`Materialbestellung "${label}" wirklich löschen?`)) {
      return;
    }
    try {
      setDeletingId(order.id);
      await fetchJson(`/api/materialbestellung/orders?id=${encodeURIComponent(order.id)}`, {
        method: "DELETE",
      });
      setOrders((current) => current.filter((o) => o.id !== order.id));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Materialbestellung konnte nicht gelöscht werden.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    void loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-0 md:py-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Materialbestellungen
        </h1>
        <Button href="/split-invoice/new" kind="primary" size="small" icon={faPlus}>
          Neue Materialbestellung
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Rechnungsnummer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Bestelldatum</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Gesamtbetrag</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Mitbesteller</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Lieferant</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Zuletzt gespeichert</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Wird geladen…
                </td>
              </tr>
            ) : errorMessage ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-sm text-rose-600">
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <span>{errorMessage}</span>
                    <Button kind="secondary" size="small" icon={faArrowsRotate} onClick={() => void loadOrders()}>
                      Erneut laden
                    </Button>
                  </div>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-5 text-sm text-zinc-600 dark:text-zinc-300">
                  Noch keine Materialbestellungen vorhanden.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">{order.supplierInvoiceNumber || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">{formatDate(order.supplierInvoiceDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">{euroFormatter.format(order.totalAmountEuro)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">{order.participantCount}</td>
                  <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">{order.supplierName || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">{formatDate(order.updatedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button href={`/split-invoice/${order.id}`} size="small">
                        Öffnen
                      </Button>
                      <button
                        type="button"
                        title="Löschen"
                        disabled={deletingId === order.id}
                        onClick={() => void handleDelete(order)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-rose-700 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                      </button>
                    </div>
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

