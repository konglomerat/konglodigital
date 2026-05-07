import Link from "next/link";

const bookingActions = [
  {
    href: "/receipts/expense",
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
    href: "/receipts/income",
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
    href: "/receipts/invoice",
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
    href: "/receipts/pretix-import",
    title: "pretix Bulk Import",
    description: "Rechnungen aus exportierten Pretix Bestellungen (JSON) erstellen",
    cardClassName:
      "hover:border-violet-300 hover:bg-violet-50 dark:hover:border-violet-900/60 dark:hover:bg-violet-950/30",
    iconClassName:
      "bg-violet-100 text-violet-600 group-hover:bg-violet-200 dark:bg-violet-950/60 dark:text-violet-400",
    icon: (
      <>
        <path d="M4 4h12l4 4v12a2 2 0 0 1-2 2H4Z" />
        <path d="M16 4v4h4" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </>
    ),
  },
  {
    href: "/receipts/reimbursement",
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
    href: "/receipts/eigenbeleg",
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

type ReceiptsPageHeaderProps = {
  title: string;
  description?: string;
  helperText?: string;
};

export default function ReceiptsPageHeader({
  title,
  description,
  helperText,
}: ReceiptsPageHeaderProps) {
  return (
    <header className="space-y-4 sm:space-y-6">
      <Link
        href="/receipts"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900 sm:px-4 sm:py-2"
      >
        <span aria-hidden="true">←</span>
        <span>Übersicht</span>
      </Link>

      <div className="grid min-w-0 gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {bookingActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`group flex min-h-0 min-w-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 sm:h-20 sm:gap-3 sm:p-3 ${action.cardClassName}`}
          >
            <span
              className={`flex h-10 w-10 flex-none items-center justify-center rounded-full transition sm:h-12 sm:w-12 ${action.iconClassName}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 sm:h-6 sm:w-6"
                aria-hidden="true"
              >
                {action.icon}
              </svg>
            </span>
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:text-base">
                {action.title}
              </span>
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
                {action.description}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>

      {description ? (
        <p className="max-w-4xl text-sm leading-relaxed text-zinc-600">
          {description}
        </p>
      ) : null}

      {helperText ? <p className="text-xs text-zinc-500">{helperText}</p> : null}
    </header>
  );
}
