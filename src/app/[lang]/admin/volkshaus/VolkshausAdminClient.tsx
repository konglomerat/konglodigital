"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faBan,
  faCalendarDays,
  faCheck,
  faCircleExclamation,
  faClock,
  faCopy,
  faDoorOpen,
  faEuroSign,
  faFileCircleCheck,
  faFileSignature,
  faHouse,
  faListCheck,
  faMagnifyingGlass,
  faNoteSticky,
  faPaperPlane,
  faPenToSquare,
  faReceipt,
  faRotate,
  faSave,
  faScrewdriverWrench,
  faTriangleExclamation,
  faUser,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import PageTitle from "../../components/PageTitle";
import {
  STATUS_LABELS,
  VOLKSHAUS_EQUIPMENT,
  applyPriceAdjustment,
  formatEuro,
  getRoomLabel,
  type VolkshausBooking,
} from "@/lib/volkshaus-booking";
import type { UserRole } from "@/lib/roles";

type AdminBooking = VolkshausBooking & { accessUrl: string };
type AssignablePerson = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  campaiName: string | null;
  roles: UserRole[];
};
type AdminAction =
  | "start_review"
  | "needs_info"
  | "hold"
  | "reject"
  | "save_assignees"
  | "save_notes"
  | "save_price_adjustment"
  | "send_contract"
  | "retry_invoice"
  | "mark_paid"
  | "mark_overdue"
  | "complete"
  | "cancel"
  | "reopen_contract";

type PendingConfirmation = {
  action: AdminAction;
  payload: Record<string, unknown>;
};

type ActionConfirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "warning";
  icon: IconProp;
  consequences: string[];
};

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

const inputClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const getPersonName = (person: AssignablePerson) => {
  if (person.campaiName?.trim()) return person.campaiName.trim();
  const fullName = [person.firstName, person.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || person.email;
};

const getPersonOptionLabel = (person: AssignablePerson) => {
  const name = getPersonName(person);
  return name === person.email ? name : `${name} · ${person.email}`;
};

const getBookedEquipment = (
  booking: Pick<VolkshausBooking, "equipment">,
) =>
  VOLKSHAUS_EQUIPMENT.filter(
    (item) => Number(booking.equipment[item.id] ?? 0) > 0,
  );

const FILTERS: Array<{
  value: string;
  label: string;
  icon: IconProp;
}> = [
  { value: "active", label: "Aktiv", icon: faListCheck },
  { value: "new", label: "Zu prüfen", icon: faClock },
  { value: "contract", label: "Vertrag", icon: faFileSignature },
  { value: "done", label: "Abgeschlossen", icon: faCheck },
  { value: "all", label: "Alle", icon: faReceipt },
];

const ACTION_CONFIRMATIONS: Partial<Record<AdminAction, ActionConfirmation>> = {
  reject: {
    title: "Anfrage wirklich ablehnen?",
    description:
      "Die Anfrage wird beendet und ist in der Kundenansicht nicht mehr aktiv.",
    confirmLabel: "Anfrage ablehnen",
    tone: "danger",
    icon: faBan,
    consequences: [
      "Eine bestehende Reservierung wird aufgehoben.",
      "Ein vorbereiteter Vertrag wird storniert.",
    ],
  },
  cancel: {
    title: "Buchung wirklich stornieren?",
    description:
      "Termin, Reservierung und Vertrag werden für diese Buchung beendet.",
    confirmLabel: "Buchung stornieren",
    tone: "danger",
    icon: faBan,
    consequences: [
      "Der Termin wird wieder für andere Anfragen freigegeben.",
      "Eine vorhandene Campai-Rechnung wird nicht automatisch storniert oder gutgeschrieben.",
    ],
  },
  reopen_contract: {
    title: "Vertrag wirklich neu aufsetzen?",
    description:
      "Die aktuelle Vertragsversion wird verworfen, damit Preis oder Inhalte erneut bearbeitet werden können.",
    confirmLabel: "Vertrag neu aufsetzen",
    tone: "danger",
    icon: faRotate,
    consequences: [
      "Bereits gespeicherte Kunden- und Teamunterschriften werden entfernt.",
      "Der überarbeitete Vertrag muss anschließend erneut freigegeben werden.",
    ],
  },
  complete: {
    title: "Nutzung als abgeschlossen markieren?",
    description:
      "Die bestätigte Buchung wird aus dem aktiven Arbeitsvorrat abgeschlossen.",
    confirmLabel: "Nutzung abschließen",
    tone: "warning",
    icon: faCheck,
    consequences: [
      "Der Status kann aktuell nicht direkt über die Oberfläche zurückgesetzt werden.",
    ],
  },
  mark_paid: {
    title: "Zahlung als bezahlt markieren?",
    description: "Der interne Zahlungsstatus wird auf „Bezahlt“ gesetzt.",
    confirmLabel: "Als bezahlt markieren",
    tone: "warning",
    icon: faEuroSign,
    consequences: [
      "Bitte nur bestätigen, wenn der Zahlungseingang geprüft wurde.",
      "Der Status in Campai wird dadurch nicht automatisch verändert.",
    ],
  },
  mark_overdue: {
    title: "Zahlung als überfällig markieren?",
    description:
      "Die offene Zahlung wird im Buchungsworkflow als überfällig gekennzeichnet.",
    confirmLabel: "Als überfällig markieren",
    tone: "warning",
    icon: faClock,
    consequences: ["Es wird dadurch keine automatische Mahnung versendet."],
  },
  send_contract: {
    title: "Vertrag freigeben und senden?",
    description:
      "Aus den aktuellen Daten wird eine unveränderliche Vertragsversion erzeugt und für die Kund:in freigegeben.",
    confirmLabel: "Vertrag freigeben",
    tone: "warning",
    icon: faFileSignature,
    consequences: [
      "Preisänderungen sind danach erst wieder nach einem Neuaufsetzen möglich.",
      "Die Vereinbarung wird dabei bereits durch Konglomerat e.V. unterschrieben.",
      "Bei konfiguriertem E-Mail-Versand wird die Kund:in sofort benachrichtigt.",
    ],
  },
  retry_invoice: {
    title: "Campai-Anlage erneut versuchen?",
    description:
      "KongloDigital versucht erneut, für diese Buchung eine Campai-Rechnung anzulegen.",
    confirmLabel: "Rechnung erneut anlegen",
    tone: "warning",
    icon: faReceipt,
    consequences: [
      "Bitte vorher prüfen, dass in Campai nicht bereits manuell eine Rechnung angelegt wurde.",
    ],
  },
};

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error ?? "Anfrage fehlgeschlagen.");
  }
  return data;
};

export default function VolkshausAdminClient() {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [assignablePeople, setAssignablePeople] = useState<AssignablePerson[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<AdminAction | null>(null);
  const [internalNotes, setInternalNotes] = useState("");
  const [adjustmentEuro, setAdjustmentEuro] = useState("0");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [backupAssignedUserId, setBackupAssignedUserId] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const bookingData = await fetchJson<{
        bookings: AdminBooking[];
        assignees: AssignablePerson[];
      }>("/api/admin/volkshaus/bookings");
      setBookings(bookingData.bookings ?? []);
      setAssignablePeople(
        [...(bookingData.assignees ?? [])].sort((left, right) =>
          getPersonName(left).localeCompare(getPersonName(right), "de"),
        ),
      );
      setSelectedId((current) => {
        if (
          current &&
          bookingData.bookings.some((booking) => booking.id === current)
        ) {
          return current;
        }
        return bookingData.bookings[0]?.id ?? null;
      });
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Buchungsanfragen konnten nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => bookings.find((booking) => booking.id === selectedId) ?? null,
    [bookings, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setInternalNotes(selected.internalNotes ?? "");
    setAdjustmentEuro((selected.priceAdjustmentCents / 100).toFixed(2));
    setAdjustmentReason(selected.priceAdjustmentReason ?? "");
    setAssignedUserId(selected.assignedUserId ?? "");
    setBackupAssignedUserId(selected.backupAssignedUserId ?? "");
    setActionError(null);
    setActionWarning(null);
    setCopySuccess(false);
    setPendingConfirmation(null);
  }, [selected?.id, selected]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("de-DE");
    return bookings.filter((booking) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "new" &&
          (booking.requestStatus === "new" ||
            booking.requestStatus === "in_review" ||
            booking.requestStatus === "needs_info")) ||
        (filter === "contract" &&
          (booking.contractStatus === "sent" ||
            booking.contractStatus === "customer_signed")) ||
        (filter === "active" &&
          booking.reservationStatus !== "cancelled" &&
          booking.reservationStatus !== "completed" &&
          booking.requestStatus !== "rejected") ||
        (filter === "done" &&
          (booking.reservationStatus === "cancelled" ||
            booking.reservationStatus === "completed" ||
            booking.requestStatus === "rejected"));
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [
        booking.referenceCode,
        booking.customerName,
        booking.organization ?? "",
        booking.email,
        booking.eventTitle,
      ]
        .join(" ")
        .toLocaleLowerCase("de-DE")
        .includes(needle);
    });
  }, [bookings, filter, search]);

  const executeAction = async (
    action: AdminAction,
    payload: Record<string, unknown> = {},
  ) => {
    if (!selected) return false;
    setActiveAction(action);
    setActionError(null);
    setActionWarning(null);
    try {
      const data = await fetchJson<{
        booking: AdminBooking;
        warning?: string | null;
      }>(`/api/admin/volkshaus/bookings/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      setBookings((current) =>
        current.map((booking) =>
          booking.id === data.booking.id ? data.booking : booking,
        ),
      );
      setActionWarning(data.warning ?? null);
      return true;
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Aktion fehlgeschlagen.",
      );
      return false;
    } finally {
      setActiveAction(null);
    }
  };

  const performAction = async (
    action: AdminAction,
    payload: Record<string, unknown> = {},
  ) => {
    if (ACTION_CONFIRMATIONS[action]) {
      setActionError(null);
      setActionWarning(null);
      setPendingConfirmation({ action, payload });
      return;
    }
    await executeAction(action, payload);
  };

  const closeConfirmation = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  const confirmPendingAction = async () => {
    if (!pendingConfirmation) return;
    const { action, payload } = pendingConfirmation;
    const completed = await executeAction(action, payload);
    if (completed) {
      setPendingConfirmation(null);
    }
  };

  const copyLink = async () => {
    if (!selected?.accessUrl) return;
    try {
      await navigator.clipboard.writeText(selected.accessUrl);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2_000);
    } catch {
      setActionError("Der Link konnte nicht kopiert werden.");
    }
  };

  return (
    <>
      <div className="space-y-6">
        <PageTitle
          title="Raumbuchungen"
          headingLevel={2}
          subTitle="Anfragen prüfen, Termine reservieren und unterschriebene Verträge versenden."
          links={[
            {
              href: "/volkshaus/buchen",
              label: "Öffentliches Formular",
              target: "_blank",
              size: "medium",
            },
          ]}
        />

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                className={`${inputClassName} pl-9`}
                type="search"
                value={search}
                placeholder="Referenz, Name, E-Mail oder Veranstaltung suchen"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(({ value, label, icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition ${
                    filter === value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FontAwesomeIcon icon={icon} className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {loadError ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
            <span>{loadError}</span>
            <Button
              kind="danger-secondary"
              icon={faRotate}
              onClick={() => void load()}
            >
              Erneut laden
            </Button>
          </div>
        ) : null}

        <div className="grid min-h-[620px] items-start gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <FontAwesomeIcon
                  icon={faListCheck}
                  className="h-3 w-3 text-primary"
                />
                {filtered.length} Anfrage{filtered.length === 1 ? "" : "n"}
              </p>
            </div>
            {isLoading ? (
              <p className="p-5 text-sm text-muted-foreground">
                Wird geladen …
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                Keine passenden Anfragen.
              </p>
            ) : (
              <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                {filtered.map((booking) => {
                  const bookedEquipment = getBookedEquipment(booking);
                  return (
                  <li key={booking.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(booking.id)}
                      className={`w-full p-4 text-left transition ${
                        booking.id === selectedId
                          ? "bg-primary-soft"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-foreground">
                            {booking.eventTitle}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {booking.customerName}
                          </p>
                        </div>
                        <StatusDot booking={booking} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <FontAwesomeIcon
                            icon={faCalendarDays}
                            className="h-3 w-3"
                          />
                          {dateFormatter.format(
                            new Date(`${booking.bookingDate}T12:00:00Z`),
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono">
                          <FontAwesomeIcon
                            icon={faReceipt}
                            className="h-3 w-3"
                          />
                          {booking.referenceCode}
                        </span>
                      </div>
                      {bookedEquipment.length > 0 ||
                      booking.internalNotes ||
                      booking.specialRequirements ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {bookedEquipment.length > 0 ? (
                            <span
                              title={bookedEquipment
                                .map(
                                  (item) =>
                                    `${Number(booking.equipment[item.id] ?? 0)} × ${item.label}`,
                                )
                                .join(", ")}
                              className="inline-flex items-center gap-1.5 rounded-md border border-warning-border bg-warning-soft px-2 py-1 text-[0.7rem] font-bold text-warning"
                            >
                              <FontAwesomeIcon
                                icon={faScrewdriverWrench}
                                className="h-2.5 w-2.5"
                              />
                              Technik: {bookedEquipment.length}
                            </span>
                          ) : null}
                          {booking.internalNotes ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary-border bg-primary-soft px-2 py-1 text-[0.7rem] font-bold text-primary">
                              <FontAwesomeIcon
                                icon={faNoteSticky}
                                className="h-2.5 w-2.5"
                              />
                              Interne Absprache
                            </span>
                          ) : null}
                          {booking.specialRequirements ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-primary-border bg-card px-2 py-1 text-[0.7rem] font-bold text-primary">
                              <FontAwesomeIcon
                                icon={faCircleExclamation}
                                className="h-2.5 w-2.5"
                              />
                              Hinweis
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {selected ? (
            <BookingDetail
              booking={selected}
              assignablePeople={assignablePeople}
              assignedUserId={assignedUserId}
              backupAssignedUserId={backupAssignedUserId}
              internalNotes={internalNotes}
              adjustmentEuro={adjustmentEuro}
              adjustmentReason={adjustmentReason}
              activeAction={activeAction}
              actionError={actionError}
              actionWarning={actionWarning}
              copySuccess={copySuccess}
              setInternalNotes={setInternalNotes}
              setAssignedUserId={setAssignedUserId}
              setBackupAssignedUserId={setBackupAssignedUserId}
              setAdjustmentEuro={setAdjustmentEuro}
              setAdjustmentReason={setAdjustmentReason}
              performAction={performAction}
              copyLink={copyLink}
            />
          ) : (
            <section className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
              <FontAwesomeIcon
                icon={faListCheck}
                className="mx-auto mb-3 h-6 w-6 text-primary"
              />
              <p>Wähle eine Anfrage aus.</p>
            </section>
          )}
        </div>
      </div>
      {pendingConfirmation && selected ? (
        <ActionConfirmationModal
          booking={selected}
          confirmation={ACTION_CONFIRMATIONS[pendingConfirmation.action]!}
          error={actionError}
          isExecuting={activeAction === pendingConfirmation.action}
          onCancel={closeConfirmation}
          onConfirm={() => void confirmPendingAction()}
        />
      ) : null}
    </>
  );
}

function ActionConfirmationModal({
  booking,
  confirmation,
  error,
  isExecuting,
  onCancel,
  onConfirm,
}: {
  booking: Pick<AdminBooking, "eventTitle" | "referenceCode" | "bookingDate">;
  confirmation: ActionConfirmation;
  error: string | null;
  isExecuting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isExecutingRef = useRef(isExecuting);

  useEffect(() => {
    isExecutingRef.current = isExecuting;
  }, [isExecuting]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>("[data-confirmation-cancel]")
        ?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isExecutingRef.current) {
          onCancel();
        }
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onCancel]);

  const toneClasses =
    confirmation.tone === "danger"
      ? "border-destructive-border bg-destructive-soft text-destructive"
      : "border-warning-border bg-warning-soft text-warning";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (!isExecuting && event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="volkshaus-confirmation-title"
        aria-describedby="volkshaus-confirmation-description"
        aria-busy={isExecuting}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${toneClasses}`}
            >
              <FontAwesomeIcon icon={confirmation.icon} className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Aktion bestätigen
              </p>
              <h2
                id="volkshaus-confirmation-title"
                className="mt-1 text-xl font-black text-foreground"
              >
                {confirmation.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isExecuting}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            aria-label="Dialog schließen"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <p
            id="volkshaus-confirmation-description"
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {confirmation.description}
          </p>

          <div className="rounded-lg border border-border bg-background p-4">
            <p className="font-bold text-foreground">{booking.eventTitle}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <FontAwesomeIcon icon={faReceipt} className="h-3 w-3" />
                {booking.referenceCode}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FontAwesomeIcon icon={faCalendarDays} className="h-3 w-3" />
                {dateFormatter.format(
                  new Date(`${booking.bookingDate}T12:00:00Z`),
                )}
              </span>
            </div>
          </div>

          <div className={`rounded-lg border p-4 ${toneClasses}`}>
            <p className="flex items-center gap-2 text-sm font-bold">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="h-3.5 w-3.5"
              />
              Das passiert anschließend
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
              {confirmation.consequences.map((consequence) => (
                <li key={consequence}>{consequence}</li>
              ))}
            </ul>
          </div>

          {error ? (
            <div className="flex gap-3 rounded-lg border border-destructive-border bg-destructive-soft p-3 text-sm text-destructive">
              <FontAwesomeIcon
                icon={faCircleExclamation}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <p>{error}</p>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 p-4 sm:flex-row sm:justify-end">
          <Button
            data-confirmation-cancel
            kind="secondary"
            icon={faXmark}
            disabled={isExecuting}
            onClick={onCancel}
          >
            Abbrechen
          </Button>
          <Button
            kind={confirmation.tone === "danger" ? "danger-primary" : "primary"}
            icon={confirmation.icon}
            disabled={isExecuting}
            onClick={onConfirm}
          >
            {isExecuting ? "Wird ausgeführt …" : confirmation.confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}

function BookingDetail({
  booking,
  assignablePeople,
  assignedUserId,
  backupAssignedUserId,
  internalNotes,
  adjustmentEuro,
  adjustmentReason,
  activeAction,
  actionError,
  actionWarning,
  copySuccess,
  setAssignedUserId,
  setBackupAssignedUserId,
  setInternalNotes,
  setAdjustmentEuro,
  setAdjustmentReason,
  performAction,
  copyLink,
}: {
  booking: AdminBooking;
  assignablePeople: AssignablePerson[];
  assignedUserId: string;
  backupAssignedUserId: string;
  internalNotes: string;
  adjustmentEuro: string;
  adjustmentReason: string;
  activeAction: AdminAction | null;
  actionError: string | null;
  actionWarning: string | null;
  copySuccess: boolean;
  setAssignedUserId: (value: string) => void;
  setBackupAssignedUserId: (value: string) => void;
  setInternalNotes: (value: string) => void;
  setAdjustmentEuro: (value: string) => void;
  setAdjustmentReason: (value: string) => void;
  performAction: (
    action: AdminAction,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
  copyLink: () => Promise<void>;
}) {
  const effectivePrice = applyPriceAdjustment(
    booking.priceSnapshot,
    booking.priceAdjustmentCents,
    booking.priceAdjustmentReason,
  );
  const equipment = getBookedEquipment(booking);
  const isBusy = activeAction !== null;
  const hasInternalNotesChanges =
    internalNotes !== (booking.internalNotes ?? "");
  const hasAssignmentChanges =
    assignedUserId !== (booking.assignedUserId ?? "") ||
    backupAssignedUserId !== (booking.backupAssignedUserId ?? "");
  const hasDuplicateAssignees =
    Boolean(assignedUserId) && assignedUserId === backupAssignedUserId;
  const missingAssignedPersonIds = [assignedUserId, backupAssignedUserId].filter(
    (userId, index, userIds) =>
      Boolean(userId) &&
      userIds.indexOf(userId) === index &&
      !assignablePeople.some((person) => person.id === userId),
  );

  return (
    <main className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={STATUS_LABELS.request[booking.requestStatus]}
                tone={
                  booking.requestStatus === "rejected"
                    ? "danger"
                    : booking.requestStatus === "approved"
                      ? "success"
                      : "warning"
                }
              />
              <StatusPill
                label={STATUS_LABELS.reservation[booking.reservationStatus]}
                tone={
                  booking.reservationStatus === "confirmed"
                    ? "success"
                    : booking.reservationStatus === "cancelled"
                      ? "danger"
                      : "neutral"
                }
              />
            </div>
            <h2 className="mt-4 flex items-center gap-3 text-3xl font-black tracking-tight text-foreground">
              <FontAwesomeIcon
                icon={faHouse}
                className="h-5 w-5 text-primary"
              />
              {booking.eventTitle}
            </h2>
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {booking.referenceCode}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              href={booking.accessUrl}
              target="_blank"
              kind="secondary"
              icon={faArrowUpRightFromSquare}
            >
              Kundenansicht
            </Button>
            <Button
              kind="secondary"
              icon={copySuccess ? faCheck : faCopy}
              onClick={() => void copyLink()}
            >
              {copySuccess ? "Kopiert" : "Link kopieren"}
            </Button>
          </div>
        </div>

        <div className="mt-6">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-foreground">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="h-3.5 w-3.5 text-warning"
            />
            Wichtig für Übergabe und Nutzung
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <section
              className={`rounded-lg border-2 p-4 ${
                equipment.length > 0
                  ? "border-warning-border bg-warning-soft/65"
                  : "border-border bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-black text-foreground">
                    <FontAwesomeIcon
                      icon={faScrewdriverWrench}
                      className={`h-4 w-4 ${
                        equipment.length > 0
                          ? "text-warning"
                          : "text-muted-foreground"
                      }`}
                    />
                    Gemietete Technik
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Für die Einmietenden bereitlegen und aushändigen.
                  </p>
                </div>
                {equipment.length > 0 ? (
                  <span className="shrink-0 rounded-md border border-warning-border bg-card/80 px-2.5 py-1 text-xs font-black text-warning">
                    {equipment.length} Position
                    {equipment.length === 1 ? "" : "en"}
                  </span>
                ) : null}
              </div>

              {equipment.length > 0 ? (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                  {equipment.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border border-warning-border bg-card/85 px-3 py-2.5 text-foreground shadow-sm"
                    >
                      <span className="flex h-8 min-w-8 items-center justify-center rounded-md bg-warning-soft px-2 font-mono text-sm font-black text-warning">
                        {Number(booking.equipment[item.id] ?? 0)} ×
                      </span>
                      <span className="text-sm font-bold leading-tight">
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 flex items-center gap-2 rounded-md border border-success-border bg-success-soft px-3 py-2.5 text-sm font-semibold text-success">
                  <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                  Keine zusätzliche Technik gemietet
                </p>
              )}
            </section>

            <section
              className={`rounded-lg border-2 p-4 ${
                internalNotes.trim() || booking.specialRequirements
                  ? "border-primary-border bg-primary-soft/60"
                  : "border-border bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-black text-foreground">
                    <FontAwesomeIcon
                      icon={faNoteSticky}
                      className="h-4 w-4 text-primary"
                    />
                    Sonstige Absprachen
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Alles, was das NVC-Team vor Ort wissen muss.
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-primary-border bg-card/80 px-2.5 py-1 text-xs font-black text-primary">
                  Intern
                </span>
              </div>

              {booking.specialRequirements ? (
                <div className="mt-4 rounded-md border border-primary-border bg-card/85 p-3">
                  <p className="text-[0.7rem] font-black uppercase tracking-widest text-primary">
                    Hinweis der Einmietenden
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">
                    {booking.specialRequirements}
                  </p>
                </div>
              ) : null}

              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-bold text-foreground">
                  Interne Absprachen ergänzen
                </span>
                <textarea
                  className={`${inputClassName} min-h-28 resize-y bg-card/90`}
                  value={internalNotes}
                  maxLength={10_000}
                  disabled={isBusy}
                  onChange={(event) => setInternalNotes(event.target.value)}
                  placeholder="z. B. Schlüsselübergabe, Bestuhlung, Einweisung, Reinigung …"
                />
              </label>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Nur im internen Bereich sichtbar.
                </p>
                <Button
                  kind="primary"
                  icon={faSave}
                  disabled={isBusy || !hasInternalNotesChanges}
                  onClick={() =>
                    void performAction("save_notes", { internalNotes })
                  }
                >
                  {activeAction === "save_notes"
                    ? "Wird gespeichert …"
                    : "Absprachen speichern"}
                </Button>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile
            label="Termin"
            icon={faCalendarDays}
            value={`${dateFormatter.format(
              new Date(`${booking.bookingDate}T12:00:00Z`),
            )}, ${booking.startTime}–${booking.endTime}`}
          />
          <InfoTile
            label="Räume"
            icon={faDoorOpen}
            value={booking.requestedRooms.map(getRoomLabel).join(", ")}
          />
          <InfoTile
            label="Personen"
            icon={faUsers}
            value={String(booking.expectedAttendees)}
          />
          <InfoTile
            label="Preis brutto"
            icon={faEuroSign}
            value={formatEuro(effectivePrice.grossCents)}
          />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <FontAwesomeIcon
                icon={faListCheck}
                className="h-3 w-3 text-primary"
              />
              Nutzung
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {booking.eventDescription}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {booking.usageType === "commercial"
                ? "Privat / kommerziell / gewerblich"
                : "Nichtkommerziell / nachbarschaftlich"}{" "}
              ·{" "}
              {booking.frequency === "recurring"
                ? `${booking.recurringOccurrences} × monatlich`
                : "einmalig"}
            </p>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <FontAwesomeIcon icon={faUser} className="h-3 w-3 text-primary" />
              Kontakt und Rechnung
            </h3>
            <address className="mt-2 not-italic text-sm leading-relaxed text-foreground">
              {booking.organization ? (
                <>
                  {booking.organization}
                  <br />
                </>
              ) : null}
              {booking.customerName}
              <br />
              {booking.billingAddressLine}
              <br />
              {booking.billingZip} {booking.billingCity}
              <br />
              <a className="text-primary" href={`mailto:${booking.email}`}>
                {booking.email}
              </a>
              {booking.phone ? (
                <>
                  <br />
                  {booking.phone}
                </>
              ) : null}
            </address>
          </div>
        </div>

      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-lg font-black text-foreground">
          <FontAwesomeIcon icon={faUsers} className="h-4 w-4 text-primary" />
          Zuständigkeit
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Verantwortliche Person und Vertretung für diese Buchung festlegen.
        </p>
        <div className="mt-4 grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
          <label>
            <span className="mb-1.5 block text-sm font-semibold">
              Verantwortliche Person
            </span>
            <select
              className={inputClassName}
              value={assignedUserId}
              disabled={isBusy}
              onChange={(event) => {
                const userId = event.target.value;
                setAssignedUserId(userId);
                if (!userId) setBackupAssignedUserId("");
              }}
            >
              <option value="">Nicht zugewiesen</option>
              {missingAssignedPersonIds.includes(assignedUserId) ? (
                <option value={assignedUserId}>
                  Nicht mehr verfügbares Konto
                </option>
              ) : null}
              {assignablePeople.map((person) => (
                <option
                  key={person.id}
                  value={person.id}
                  disabled={person.id === backupAssignedUserId}
                >
                  {getPersonOptionLabel(person)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-semibold">
              Ersatz / Vertretung
            </span>
            <select
              className={inputClassName}
              value={backupAssignedUserId}
              disabled={isBusy || !assignedUserId}
              onChange={(event) =>
                setBackupAssignedUserId(event.target.value)
              }
            >
              <option value="">Kein Ersatz</option>
              {missingAssignedPersonIds.includes(backupAssignedUserId) ? (
                <option value={backupAssignedUserId}>
                  Nicht mehr verfügbares Konto
                </option>
              ) : null}
              {assignablePeople.map((person) => (
                <option
                  key={person.id}
                  value={person.id}
                  disabled={person.id === assignedUserId}
                >
                  {getPersonOptionLabel(person)}
                </option>
              ))}
            </select>
          </label>
          <Button
            kind="secondary"
            icon={faSave}
            disabled={
              isBusy || !hasAssignmentChanges || hasDuplicateAssignees
            }
            onClick={() =>
              void performAction("save_assignees", {
                assignedUserId: assignedUserId || null,
                backupAssignedUserId: backupAssignedUserId || null,
              })
            }
          >
            {activeAction === "save_assignees"
              ? "Wird gespeichert …"
              : "Zuständigkeit speichern"}
          </Button>
        </div>
        {hasDuplicateAssignees ? (
          <p className="mt-2 text-xs text-destructive">
            Verantwortliche Person und Ersatz müssen verschieden sein.
          </p>
        ) : null}
      </section>

      <WorkflowActions
        booking={booking}
        isBusy={isBusy}
        activeAction={activeAction}
        performAction={performAction}
      />

      {actionError ? (
        <div className="flex gap-3 rounded-lg border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
          <FontAwesomeIcon
            icon={faCircleExclamation}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          {actionError}
        </div>
      ) : null}
      {actionWarning ? (
        <div className="flex gap-3 rounded-lg border border-warning-border bg-warning-soft p-4 text-sm text-warning">
          <FontAwesomeIcon
            icon={faTriangleExclamation}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          {actionWarning}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-lg font-black text-foreground">
            <FontAwesomeIcon
              icon={faEuroSign}
              className="h-4 w-4 text-primary"
            />
            Preisprüfung
          </h3>
          <div className="mt-4 divide-y divide-border">
            {effectivePrice.lines.map((line) => (
              <div
                key={line.code}
                className="flex justify-between gap-3 py-2.5 text-sm"
              >
                <span className="text-foreground">{line.description}</span>
                <span
                  className={`whitespace-nowrap font-semibold ${
                    line.totalNetCents < 0
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  {formatEuro(line.totalNetCents)}
                </span>
              </div>
            ))}
          </div>
          <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Netto</dt>
              <dd>{formatEuro(effectivePrice.netCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">USt. 19 %</dt>
              <dd>{formatEuro(effectivePrice.taxCents)}</dd>
            </div>
            <div className="flex justify-between text-lg font-black">
              <dt>Brutto</dt>
              <dd>{formatEuro(effectivePrice.grossCents)}</dd>
            </div>
          </dl>
          <div className="mt-5 grid gap-3">
            <label>
              <span className="mb-1.5 block text-sm font-semibold">
                Anpassung netto in Euro
              </span>
              <input
                className={inputClassName}
                type="number"
                step="0.01"
                value={adjustmentEuro}
                disabled={booking.contractStatus !== "draft"}
                onChange={(event) => setAdjustmentEuro(event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-semibold">
                Begründung
              </span>
              <input
                className={inputClassName}
                value={adjustmentReason}
                disabled={booking.contractStatus !== "draft"}
                placeholder="z. B. Kulanz oder Sondervereinbarung"
                onChange={(event) => setAdjustmentReason(event.target.value)}
              />
            </label>
            <Button
              kind="secondary"
              icon={faSave}
              disabled={isBusy || booking.contractStatus !== "draft"}
              onClick={() =>
                void performAction("save_price_adjustment", {
                  adjustmentEuro: Number(adjustmentEuro.replace(",", ".")),
                  reason: adjustmentReason,
                })
              }
            >
              Preis speichern
            </Button>
          </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-lg font-black text-foreground">
          <FontAwesomeIcon
            icon={faFileCircleCheck}
            className="h-4 w-4 text-primary"
          />
          Vertrag, Rechnung und Zahlung
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <WorkflowTile
            label="Vertrag"
            icon={faFileSignature}
            value={STATUS_LABELS.contract[booking.contractStatus]}
            meta={
              booking.customerSignedAt
                ? `Kundensignatur ${dateTimeFormatter.format(
                    new Date(booking.customerSignedAt),
                  )}`
                : undefined
            }
          />
          <WorkflowTile
            label="VHC-Unterschrift"
            icon={faFileCircleCheck}
            value={
              booking.staffSignature
                ? booking.staffSignature.name
                : "Noch nicht erfolgt"
            }
            meta={
              booking.staffSignedAt
                ? dateTimeFormatter.format(new Date(booking.staffSignedAt))
                : undefined
            }
          />
          <WorkflowTile
            label="Campai-Rechnung"
            icon={faReceipt}
            value={STATUS_LABELS.invoice[booking.invoiceStatus]}
            meta={booking.campaiInvoiceId ?? booking.campaiError ?? undefined}
          />
          <WorkflowTile
            label="Zahlung"
            icon={faEuroSign}
            value={STATUS_LABELS.payment[booking.paymentStatus]}
          />
        </div>
      </section>
    </main>
  );
}

function WorkflowActions({
  booking,
  isBusy,
  activeAction,
  performAction,
}: {
  booking: AdminBooking;
  isBusy: boolean;
  activeAction: AdminAction | null;
  performAction: (
    action: AdminAction,
    payload?: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const actionLabel = (action: AdminAction, fallback: string) =>
    activeAction === action ? "Wird ausgeführt …" : fallback;

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <FontAwesomeIcon icon={faListCheck} className="h-3 w-3 text-primary" />
        Nächste Schritte
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {booking.requestStatus === "new" ? (
          <Button
            kind="primary"
            icon={faPenToSquare}
            disabled={isBusy}
            onClick={() => void performAction("start_review")}
          >
            {actionLabel("start_review", "Prüfung beginnen")}
          </Button>
        ) : null}
        {["new", "in_review", "needs_info"].includes(booking.requestStatus) ? (
          <>
            <Button
              kind="primary"
              icon={faClock}
              disabled={isBusy}
              onClick={() => void performAction("hold")}
            >
              {actionLabel("hold", "Freigeben & 7 Tage reservieren")}
            </Button>
            <Button
              kind="secondary"
              icon={faPaperPlane}
              disabled={isBusy}
              onClick={() => void performAction("needs_info")}
            >
              {actionLabel("needs_info", "Rückfrage markieren")}
            </Button>
            <Button
              kind="danger-secondary"
              icon={faBan}
              disabled={isBusy}
              onClick={() => void performAction("reject")}
            >
              {actionLabel("reject", "Ablehnen")}
            </Button>
          </>
        ) : null}
        {booking.requestStatus === "approved" &&
        booking.reservationStatus === "held" &&
        booking.contractStatus === "draft" ? (
          <Button
            kind="primary"
            icon={faFileSignature}
            disabled={isBusy}
            onClick={() => void performAction("send_contract")}
          >
            {actionLabel("send_contract", "Vertrag freigeben & senden")}
          </Button>
        ) : null}
        {booking.contractStatus === "fully_signed" &&
        !booking.campaiInvoiceId ? (
          <Button
            kind="primary"
            icon={faReceipt}
            disabled={isBusy}
            onClick={() => void performAction("retry_invoice")}
          >
            {actionLabel("retry_invoice", "Campai-Anlage erneut versuchen")}
          </Button>
        ) : null}
        {booking.campaiInvoiceId &&
        ["draft_created", "created"].includes(booking.invoiceStatus) &&
        booking.paymentStatus !== "paid" ? (
          <Button
            kind="secondary"
            icon={faCheck}
            disabled={isBusy}
            onClick={() => void performAction("mark_paid")}
          >
            Als bezahlt markieren
          </Button>
        ) : null}
        {booking.campaiInvoiceId &&
        ["draft_created", "created"].includes(booking.invoiceStatus) &&
        booking.paymentStatus === "open" ? (
          <Button
            kind="secondary"
            icon={faClock}
            disabled={isBusy}
            onClick={() => void performAction("mark_overdue")}
          >
            Als überfällig markieren
          </Button>
        ) : null}
        {booking.reservationStatus === "confirmed" ? (
          <Button
            kind="secondary"
            icon={faCheck}
            disabled={isBusy}
            onClick={() => void performAction("complete")}
          >
            Nutzung abschließen
          </Button>
        ) : null}
        {booking.contractStatus !== "draft" &&
        booking.contractStatus !== "fully_signed" &&
        booking.contractStatus !== "cancelled" ? (
          <Button
            kind="secondary"
            icon={faRotate}
            disabled={isBusy}
            onClick={() => void performAction("reopen_contract")}
          >
            Vertrag neu aufsetzen
          </Button>
        ) : null}
        {booking.reservationStatus !== "cancelled" &&
        booking.reservationStatus !== "completed" &&
        booking.requestStatus !== "rejected" ? (
          <Button
            kind="danger-secondary"
            icon={faBan}
            disabled={isBusy}
            onClick={() => void performAction("cancel")}
          >
            Buchung stornieren
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function StatusDot({ booking }: { booking: AdminBooking }) {
  const className =
    booking.requestStatus === "rejected" ||
    booking.reservationStatus === "cancelled"
      ? "bg-destructive"
      : booking.contractStatus === "customer_signed"
        ? "bg-primary"
        : booking.reservationStatus === "confirmed"
          ? "bg-success"
          : "bg-warning";
  return (
    <span
      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      aria-hidden="true"
    />
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const classes = {
    success: "border-success-border bg-success-soft text-success",
    warning: "border-warning-border bg-warning-soft text-warning",
    danger: "border-destructive-border bg-destructive-soft text-destructive",
    neutral: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-bold ${classes[tone]}`}
    >
      <FontAwesomeIcon
        icon={
          tone === "success"
            ? faCheck
            : tone === "danger"
              ? faTriangleExclamation
              : tone === "warning"
                ? faClock
                : faCircleExclamation
        }
        className="h-3 w-3"
      />
      {label}
    </span>
  );
}

function InfoTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: IconProp;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <FontAwesomeIcon icon={icon} className="h-3 w-3 text-primary" />
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground">
        {value}
      </p>
    </div>
  );
}

function WorkflowTile({
  label,
  value,
  meta,
  icon,
}: {
  label: string;
  value: string;
  meta?: string;
  icon: IconProp;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <FontAwesomeIcon icon={icon} className="h-3 w-3 text-primary" />
        {label}
      </p>
      <p className="mt-2 text-sm font-bold text-foreground">{value}</p>
      {meta ? (
        <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground">
          {meta}
        </p>
      ) : null}
    </div>
  );
}
