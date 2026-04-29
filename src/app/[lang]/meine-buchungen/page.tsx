import { redirect } from "next/navigation";
import Link from "next/link";

import { getCampaiBookingDisplayName } from "@/lib/campai-booking-tags";
import { listCampaiReceipts } from "@/lib/campai-list-receipts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bookingActions = [
  {
    href: "/meine-buchungen/ausgabe",
    title: "Ausgabe erfassen",
    description: "Beleg für eine Ausgabe hinzufügen",
    cardClassName:
      "hover:border-rose-300 hover:bg-rose-50 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/30",
    iconClassName:
      "bg-rose-100 text-rose-600 group-hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-400",
    icon: (
      <>
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
      </>
    ),
  },
  {
    href: "/meine-buchungen/einnahme",
    title: "Einnahme erfassen",
    description: "Beleg für eine Einnahme hinzufügen",
    cardClassName:
      "hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-900/60 dark:hover:bg-emerald-950/30",
    iconClassName:
      "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400",
    icon: (
      <>
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </>
    ),
  },
  {
    href: "/meine-buchungen/rechnung",
    title: "Neue Rechnung",
    description: "Neue Rechnung direkt erstellen",
    cardClassName:
      "hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-900/60 dark:hover:bg-blue-950/30",
    iconClassName:
      "bg-blue-100 text-blue-600 group-hover:bg-blue-200 dark:bg-blue-950/60 dark:text-blue-400",
    icon: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
  },
  {
    href: "/reimbursement",
    title: "Rückerstattung",
    description: "Formular für Rückerstattung von Auslagen öffnen",
    cardClassName:
      "hover:border-amber-300 hover:bg-amber-50 dark:hover:border-amber-900/60 dark:hover:bg-amber-950/30",
    iconClassName:
      "bg-amber-100 text-amber-600 group-hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-400",
    icon: (
      <>
        <path d="M7 7h10" />
        <path d="M7 12h10" />
        <path d="M7 17h6" />
        <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      </>
    ),
  },
  {
    href: "/eigenbeleg",
    title: "Eigenbeleg",
    description: "Eigenbeleg-Formular öffnen",
    cardClassName:
      "hover:border-zinc-400 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-950/40",
    iconClassName:
      "bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200",
    icon: (
      <>
        <path d="M8 7h8" />
        <path d="M8 12h8" />
        <path d="M8 17h5" />
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
] as const;

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

const getReceiptStatusChipClassName = (status: string | null) => {
  const normalizedStatus = status?.trim().toLowerCase();

  if (normalizedStatus === "bezahlt") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
  }

  if (
    normalizedStatus === "unbezahlt" ||
    normalizedStatus === "offen" ||
    normalizedStatus === "ausstehend"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300";
  }

  return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
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
        <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-3">
          {bookingActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 ${action.cardClassName}`}
            >
              <span
                className={`flex h-12 w-12 flex-none items-center justify-center rounded-full transition ${action.iconClassName}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  {action.icon}
                </svg>
              </span>
              <span className="flex flex-col text-left">
                <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {action.title}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {action.description}
                </span>
              </span>
            </Link>
          ))}
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
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                PDF
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
                  colSpan={9}
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
                  <td className="px-4 py-3 text-center">
                    <a
                      href={`/api/campai/receipts/${receipt.id}/download`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-600 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-900"
                      aria-label={`PDF für ${receipt.receiptNumber || "diesen Beleg"} herunterladen`}
                      title="PDF herunterladen"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M12 3v12" />
                        <path d="m7 10 5 5 5-5" />
                        <path d="M5 21h14" />
                      </svg>
                    </a>
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
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getReceiptStatusChipClassName(
                        receipt.status,
                      )}`}
                    >
                      {receipt.status || "—"}
                    </span>
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