import { redirect } from "next/navigation";
import Link from "next/link";

import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import { listCampaiReceipts } from "@/lib/campai-list-receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const formatDate = (value: string | null) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("de-DE");
};

const formatAmount = (amountInCents: number | null, currency: string | null) => {
  if (amountInCents === null) {
    return "—";
  }

  const safeCurrency =
    typeof currency === "string" && currency.trim().length === 3
      ? currency.trim().toUpperCase()
      : "EUR";

  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: safeCurrency,
    }).format(amountInCents / 100);
  } catch {
    return `€${(amountInCents / 100).toFixed(2)}`;
  }
};

type MeineBuchungenPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MeineBuchungenPage({
  searchParams,
}: MeineBuchungenPageProps) {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();
  const resolvedSearchParams = await searchParams;
  const debug = resolvedSearchParams?.debug === "1";

  if (!data.user) {
    redirect("/login?redirectedFrom=/meine-buchungen");
  }

  const currentUserDisplayName = getCampaiBookingDisplayName(data.user);

  const { receipts, debugEntries } = await listCampaiReceipts({
    currentUserDisplayName,
    debug,
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-0 md:py-0">
      <div className="space-y-2 pb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Meine Buchungen
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Belege aus Campai, deren Tag deinem Campai-Anzeigenamen entspricht.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/meine-buchungen/ausgabe"
            className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm transition hover:bg-zinc-50"
          >
            ↓ Ausgabe erfassen
          </Link>
          <Link
            href="/meine-buchungen/einnahme"
            className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-600 shadow-sm transition hover:bg-zinc-50"
          >
            ↑ Einnahme erfassen
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Datum
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Beleg
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Betrag
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Beschreibung
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Typ
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Werkbereich
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Sender/Empfänger
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {receipts.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  Keine Buchungen gefunden.
                </td>
              </tr>
            ) : (
              receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {formatDate(receipt.date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {receipt.receiptNumber || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-zinc-800 dark:text-zinc-100">
                    {formatAmount(receipt.amountInCents, receipt.currency)}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {receipt.description || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {receipt.type || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {receipt.workArea || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {receipt.status || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100">
                    {receipt.accountName || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {debug ? (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Campai Debug Response
          </h2>
          {debugEntries.map((entry, index) => (
            <div
              key={`${entry.endpoint}-${index}`}
              className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-xs text-zinc-100 shadow-sm dark:border-zinc-800"
            >
              <pre>{JSON.stringify(entry, null, 2)}</pre>
            </div>
          ))}
          {debugEntries.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Kein Debug-Output vorhanden.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}