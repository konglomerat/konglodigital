"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faCalendarDays,
  faCalendarCheck,
  faCheck,
  faCircleInfo,
  faClock,
  faDoorOpen,
  faDownload,
  faEuroSign,
  faFileSignature,
  faHouse,
  faListCheck,
  faReceipt,
  faRepeat,
  faRotate,
  faTriangleExclamation,
  faUser,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import {
  formatEuro,
  getEquipmentLabel,
  getRoomLabel,
  type VolkshausBooking,
  type VolkshausContractSnapshot,
  type VolkshausEquipmentId,
  type VolkshausPriceSnapshot,
  type VolkshausSignature,
} from "@/lib/volkshaus-booking";

type CustomerBooking = Pick<
  VolkshausBooking,
  | "id"
  | "referenceCode"
  | "requestStatus"
  | "reservationStatus"
  | "contractStatus"
  | "invoiceStatus"
  | "paymentStatus"
  | "customerName"
  | "organization"
  | "email"
  | "eventTitle"
  | "eventDescription"
  | "usageType"
  | "frequency"
  | "recurringOccurrences"
  | "expectedAttendees"
  | "bookingDate"
  | "startTime"
  | "endTime"
  | "setupStartTime"
  | "teardownEndTime"
  | "requestedRooms"
  | "equipment"
  | "specialRequirements"
  | "holdExpiresAt"
  | "contractHash"
  | "customerSignature"
  | "staffSignature"
  | "campaiInvoiceId"
  | "createdAt"
  | "updatedAt"
> & {
  requestStatusLabel: string;
  reservationStatusLabel: string;
  contractStatusLabel: string;
  invoiceStatusLabel: string;
  paymentStatusLabel: string;
  price: VolkshausPriceSnapshot;
  contractSnapshot: VolkshausContractSnapshot | null;
};

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "long",
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

const WORKFLOW_STEPS = [
  {
    id: "request",
    label: "Anfrage",
    description: "Angaben wurden übermittelt",
    icon: faCircleInfo,
  },
  {
    id: "hold",
    label: "Prüfung",
    description: "Termin und Preis werden geprüft",
    icon: faClock,
  },
  {
    id: "contract",
    label: "Vertrag",
    description: "Deine Unterschrift",
    icon: faFileSignature,
  },
  {
    id: "invoice",
    label: "Rechnung",
    description: "Anlage in Campai",
    icon: faReceipt,
  },
  {
    id: "confirmed",
    label: "Bestätigt",
    description: "Buchung ist verbindlich",
    icon: faCalendarCheck,
  },
] as const;

const getWorkflowPosition = (booking: CustomerBooking) => {
  if (booking.reservationStatus === "confirmed") return 4;
  if (
    booking.invoiceStatus === "created" ||
    booking.invoiceStatus === "draft_created"
  ) {
    return 3;
  }
  if (
    booking.contractStatus === "sent" ||
    booking.contractStatus === "customer_signed" ||
    booking.contractStatus === "fully_signed"
  ) {
    return 2;
  }
  if (
    booking.requestStatus === "in_review" ||
    booking.requestStatus === "approved" ||
    booking.requestStatus === "needs_info"
  ) {
    return 1;
  }
  return 0;
};

export default function CustomerBookingPortal({ token }: { token: string }) {
  const [booking, setBooking] = useState<CustomerBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  const endpoint = `/api/volkshaus/requests/access/${encodeURIComponent(token)}`;
  const contractUrl = `${endpoint}/contract`;

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        booking?: CustomerBooking;
        error?: string;
      };
      if (!response.ok || !data.booking) {
        throw new Error(data.error ?? "Anfrage konnte nicht geladen werden.");
      }
      setBooking(data.booking);
      setSignerName((current) => current || data.booking?.customerName || "");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Anfrage konnte nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedEquipment = useMemo(
    () =>
      booking
        ? Object.entries(booking.equipment).filter(
            (entry): entry is [VolkshausEquipmentId, number] =>
              Number(entry[1]) > 0,
          )
        : [],
    [booking],
  );

  const sign = async () => {
    setIsSigning(true);
    setSignError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign_contract",
          signerName,
          accepted,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        booking?: CustomerBooking;
        error?: string;
      };
      if (!response.ok || !data.booking) {
        throw new Error(
          data.error ?? "Unterschrift konnte nicht gespeichert werden.",
        );
      }
      setBooking(data.booking);
    } catch (error) {
      setSignError(
        error instanceof Error
          ? error.message
          : "Unterschrift konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSigning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Anfrage wird geladen …</p>
      </div>
    );
  }

  if (loadError || !booking) {
    return (
      <section className="mx-auto max-w-2xl rounded-lg border border-destructive-border bg-destructive-soft p-8 text-center shadow-sm">
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="h-8 w-8 text-destructive"
        />
        <h1 className="mt-4 text-2xl font-black text-foreground">
          Anfrage nicht verfügbar
        </h1>
        <p className="mt-2 text-sm text-destructive">{loadError}</p>
        <Button
          className="mt-6"
          kind="secondary"
          icon={faRotate}
          onClick={() => void load()}
        >
          Erneut versuchen
        </Button>
      </section>
    );
  }

  const workflowPosition = getWorkflowPosition(booking);
  const isCancelled =
    booking.reservationStatus === "cancelled" ||
    booking.requestStatus === "rejected";

  return (
    <div className="space-y-6 py-3 md:py-8">
      <header className="rounded-lg border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
              <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" />
              Neues Volkshaus Cotta
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-5xl">
              {booking.eventTitle}
            </h1>
            <p className="mt-3 font-mono text-sm font-semibold text-muted-foreground">
              {booking.referenceCode}
            </p>
          </div>
          <StatusBadge
            label={isCancelled ? "Nicht aktiv" : booking.reservationStatusLabel}
            tone={
              isCancelled
                ? "danger"
                : booking.reservationStatus === "confirmed"
                  ? "success"
                  : "warning"
            }
          />
        </div>
      </header>

      {!isCancelled ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm md:p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
            <FontAwesomeIcon
              icon={faListCheck}
              className="h-3.5 w-3.5 text-primary"
            />
            Stand deiner Anfrage
          </h2>
          <ol className="mt-5 grid gap-3 md:grid-cols-5">
            {WORKFLOW_STEPS.map((entry, index) => {
              const completed = index < workflowPosition;
              const current = index === workflowPosition;
              return (
                <li
                  key={entry.id}
                  className={`rounded-lg border p-4 ${
                    current
                      ? "border-primary bg-primary-soft"
                      : completed
                        ? "border-success-border bg-success-soft"
                        : "border-border bg-background"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      current
                        ? "bg-primary text-primary-foreground"
                        : completed
                          ? "bg-success text-success-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <FontAwesomeIcon
                      icon={completed ? faCheck : entry.icon}
                      className="h-3.5 w-3.5"
                    />
                  </span>
                  <p className="mt-3 text-sm font-bold text-foreground">
                    {entry.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {entry.description}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <section className="rounded-lg border border-destructive-border bg-destructive-soft p-5 text-sm text-destructive shadow-sm">
          Diese Anfrage ist nicht mehr aktiv. Bei Rückfragen antworte bitte auf
          die Korrespondenz des Volkshaus-Teams.
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm md:p-6">
            <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
              <FontAwesomeIcon
                icon={faCalendarCheck}
                className="h-4 w-4 text-primary"
              />
              Buchungsdetails
            </h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <Detail
                label="Termin"
                icon={faCalendarDays}
                value={`${dateFormatter.format(
                  new Date(`${booking.bookingDate}T12:00:00Z`),
                )}, ${booking.startTime}–${booking.endTime} Uhr`}
              />
              <Detail
                label="Räume"
                icon={faDoorOpen}
                value={booking.requestedRooms.map(getRoomLabel).join(", ")}
              />
              <Detail
                label="Nutzung"
                icon={faRepeat}
                value={
                  booking.frequency === "recurring"
                    ? `${booking.recurringOccurrences} × monatlich`
                    : "Einmalige Nutzung"
                }
              />
              <Detail
                label="Personen"
                icon={faUsers}
                value={`${booking.expectedAttendees} erwartet`}
              />
              <Detail
                label="Kontakt"
                icon={faUser}
                value={`${booking.customerName} · ${booking.email}`}
              />
              <Detail
                label="Status"
                icon={faFileSignature}
                value={`${booking.requestStatusLabel} · ${booking.contractStatusLabel}`}
              />
            </dl>
            <div className="mt-5 rounded-lg border border-border bg-background p-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <FontAwesomeIcon
                  icon={faCircleInfo}
                  className="h-3 w-3 text-primary"
                />
                Beschreibung
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {booking.eventDescription}
              </p>
            </div>
            {selectedEquipment.length > 0 ? (
              <div className="mt-4 rounded-lg border border-border bg-background p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <FontAwesomeIcon
                    icon={faBoxOpen}
                    className="h-3 w-3 text-primary"
                  />
                  Ausstattung
                </h3>
                <ul className="mt-2 text-sm text-foreground">
                  {selectedEquipment.map(([id, quantity]) => (
                    <li key={id}>
                      {quantity} × {getEquipmentLabel(id)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {booking.contractSnapshot ? (
            <ContractSection
              booking={booking}
              token={token}
              signerName={signerName}
              accepted={accepted}
              isSigning={isSigning}
              signError={signError}
              setSignerName={setSignerName}
              setAccepted={setAccepted}
              sign={sign}
              contractUrl={contractUrl}
            />
          ) : (
            <section className="rounded-lg border border-info-border bg-info-soft p-5 text-sm text-info shadow-sm md:p-6">
              <div className="flex gap-3">
                <FontAwesomeIcon
                  icon={faCircleInfo}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <div>
                  <h2 className="font-bold">Noch kein Vertrag verfügbar</h2>
                  <p className="mt-1 leading-relaxed">
                    Das Team prüft Verfügbarkeit, Nutzungszweck und Preis. Nach
                    der Freigabe erscheint die Nutzungsvereinbarung hier.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <FontAwesomeIcon
                icon={faEuroSign}
                className="h-3 w-3 text-primary"
              />
              Vereinbarter Preis
            </p>
            <div className="mt-4 divide-y divide-border">
              {booking.price.lines.map((line) => (
                <div
                  key={line.code}
                  className="flex items-start justify-between gap-3 py-3 text-sm"
                >
                  <span className="text-foreground">{line.description}</span>
                  <span className="whitespace-nowrap font-semibold text-foreground">
                    {formatEuro(line.totalNetCents)}
                  </span>
                </div>
              ))}
            </div>
            <dl className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Netto</dt>
                <dd>{formatEuro(booking.price.netCents)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>USt. 19 %</dt>
                <dd>{formatEuro(booking.price.taxCents)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-2">
                <dt className="font-bold">Brutto</dt>
                <dd className="text-2xl font-black">
                  {formatEuro(booking.price.grossCents)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 text-sm shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-foreground">
              <FontAwesomeIcon
                icon={faReceipt}
                className="h-3.5 w-3.5 text-primary"
              />
              Abrechnung
            </h2>
            <dl className="mt-3 space-y-2 text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>Rechnung</dt>
                <dd className="text-right font-medium text-foreground">
                  {booking.invoiceStatusLabel}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Zahlung</dt>
                <dd className="text-right font-medium text-foreground">
                  {booking.paymentStatusLabel}
                </dd>
              </div>
            </dl>
            {!isCancelled && booking.contractStatus === "fully_signed" ? (
              <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                Bitte bezahlen bis 3 Tage vor Buchung.
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ContractSection({
  booking,
  signerName,
  accepted,
  isSigning,
  signError,
  setSignerName,
  setAccepted,
  sign,
  contractUrl,
}: {
  booking: CustomerBooking;
  token: string;
  signerName: string;
  accepted: boolean;
  isSigning: boolean;
  signError: string | null;
  setSignerName: (value: string) => void;
  setAccepted: (value: boolean) => void;
  sign: () => Promise<void>;
  contractUrl: string;
}) {
  const snapshot = booking.contractSnapshot!;
  const canSign = booking.contractStatus === "sent";
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
            <FontAwesomeIcon icon={faFileSignature} className="h-3 w-3" />
            Nutzungsvereinbarung
          </p>
          <h2 className="mt-1 text-2xl font-black text-foreground">
            Vertrag #{booking.referenceCode}
          </h2>
        </div>
        <Button
          href={contractUrl}
          target="_blank"
          kind="secondary"
          icon={faDownload}
        >
          PDF öffnen
        </Button>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-background p-5">
        <p className="text-sm text-muted-foreground">
          Zwischen <strong>{snapshot.provider.name}</strong> und{" "}
          <strong>
            {snapshot.customer.organization || snapshot.customer.name}
          </strong>
        </p>
        <div className="mt-5 space-y-5">
          {snapshot.terms.map((section) => (
            <div key={section.heading}>
              <h3 className="font-bold text-foreground">{section.heading}</h3>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {canSign ? (
        <div className="mt-6 rounded-lg border border-primary-border bg-primary-soft p-5">
          <h3 className="flex items-center gap-2 text-lg font-black text-foreground">
            <FontAwesomeIcon
              icon={faFileSignature}
              className="h-4 w-4 text-primary"
            />
            Verbindlich unterschreiben
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Deine Unterschrift wird zusammen mit Zeitpunkt, Vertragsprüfsumme
            und einem pseudonymisierten technischen Nachweis gespeichert.
          </p>
          <label className="mt-5 block">
            <span className="mb-1.5 block text-sm font-semibold text-foreground">
              Vollständiger Name
            </span>
            <input
              className={inputClassName}
              value={signerName}
              onChange={(event) => setSignerName(event.target.value)}
            />
          </label>
          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-input accent-primary"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span className="text-sm leading-relaxed text-foreground">
              Ich habe die Nutzungsvereinbarung vollständig gelesen, bestätige
              die Richtigkeit der Angaben und unterschreibe verbindlich.
            </span>
          </label>
          {signError ? (
            <p className="mt-4 text-sm text-destructive">{signError}</p>
          ) : null}
          <Button
            className="mt-5"
            kind="primary"
            size="large"
            icon={faFileSignature}
            disabled={isSigning || !accepted || signerName.trim().length < 2}
            onClick={() => void sign()}
          >
            {isSigning ? "Wird unterschrieben …" : "Jetzt unterschreiben"}
          </Button>
        </div>
      ) : null}

      {booking.customerSignature ? (
        <SignatureCard
          label="Unterschrift Nutzer:in"
          signature={booking.customerSignature}
        />
      ) : null}
      {booking.staffSignature ? (
        <SignatureCard
          label="Unterschrift Konglomerat e.V."
          signature={booking.staffSignature}
        />
      ) : null}
    </section>
  );
}

function SignatureCard({
  label,
  signature,
}: {
  label: string;
  signature: VolkshausSignature;
}) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-success-border bg-success-soft p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
        <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
      </span>
      <div className="text-sm">
        <p className="font-bold text-foreground">{label}</p>
        <p className="mt-1 text-muted-foreground">
          {signature.name} ·{" "}
          {dateTimeFormatter.format(new Date(signature.signedAt))}
        </p>
      </div>
    </div>
  );
}

function Detail({
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
      <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <FontAwesomeIcon icon={icon} className="h-3 w-3 text-primary" />
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-relaxed text-foreground">{value}</dd>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger";
}) {
  const classes = {
    success: "border-success-border bg-success-soft text-success",
    warning: "border-warning-border bg-warning-soft text-warning",
    danger: "border-destructive-border bg-destructive-soft text-destructive",
  };
  return (
    <span
      className={`inline-flex self-start items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-bold ${classes[tone]}`}
    >
      <FontAwesomeIcon
        icon={
          tone === "success"
            ? faCheck
            : tone === "danger"
              ? faTriangleExclamation
              : faClock
        }
        className="h-3 w-3"
      />
      {label}
    </span>
  );
}
