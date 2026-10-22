"use client";

// Buchungsformular für einen Workshop-Termin. Vier Abschnitte — Plätze &
// Tarif, deine Daten, Bezahlung, Abschluss — und rechts die Eckdaten des
// Termins. Abgeschickt wird an /api/workshops/[eventId]/book, das die
// Buchung in Campai anlegt; Campai schickt Bestätigung und Zahlungsinfos.
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { faArrowLeft, faCalendarPlus } from "@fortawesome/free-solid-svg-icons";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Choice, { ChoiceGroup } from "@/components/knglmrt/Choice";
import Face from "@/components/knglmrt/Face";
import Field from "@/components/knglmrt/Field";
import FormSection from "@/components/knglmrt/FormSection";
import Notice from "@/components/knglmrt/Notice";
import Stepper from "@/components/knglmrt/Stepper";
import { useI18n } from "@/i18n/client";
import {
  PAYMENT_METHOD_LABEL,
  WORKSHOP_BOOKING_EMAIL,
  bookingAction,
  formatDate,
  formatDayMonth,
  formatDuration,
  formatEuro,
  formatPrice,
  formatTimeRange,
  formatWeekday,
  formatWeekdayShort,
  maxSeatsFor,
  normalizePhone,
  ratesFor,
  seatStatus,
  type WorkshopEvent,
  type WorkshopPaymentMethod,
} from "@/lib/workshops";

export type BookingViewer = {
  authenticated: boolean;
  isMember: boolean;
  name: string;
  email: string;
};

type Props = {
  event: WorkshopEvent;
  viewer: BookingViewer;
  otherDates: WorkshopEvent[];
  loginHref: string;
  overviewHref: string;
};

type Result = { waitlisted: boolean; email: string; seats: number; paid: boolean };

const icsDate = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const icsEscape = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&");

const buildIcsHref = (event: WorkshopEvent) => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Konglomerat e.V.//Workshops//DE",
    "BEGIN:VEVENT",
    `UID:${event.id}@konglomerat.org`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : "",
    event.placeAddress || event.placeName
      ? `LOCATION:${icsEscape(
          [event.placeName, event.placeAddress].filter(Boolean).join(", "),
        )}`
      : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
};

export default function WorkshopBooking({
  event,
  viewer,
  otherDates,
  loginHref,
  overviewHref,
}: Props) {
  const { tx } = useI18n();
  const action = bookingAction(event);
  const waitlist = action === "waitlist";
  const status = seatStatus(event);
  const rates = useMemo(() => ratesFor(event, viewer.isMember), [event, viewer.isMember]);
  const hiddenMemberRates =
    !viewer.isMember && event.rates.some((rate) => rate.memberOnly);
  const offlineMethods = event.paymentMethods.filter(
    (method): method is Exclude<WorkshopPaymentMethod, "online"> => method !== "online",
  );
  const maxSeats = maxSeatsFor(event);

  // Mitglieder bekommen den günstigsten Mitgliedertarif vorausgewählt, alle
  // anderen den Standardtarif.
  const [rateId, setRateId] = useState<string | null>(() => {
    const memberRates = rates.filter((rate) => rate.memberOnly);
    if (memberRates.length > 0) {
      return [...memberRates].sort(
        (a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0),
      )[0].id;
    }
    return (rates.find((rate) => rate.standard) ?? rates[0])?.id ?? null;
  });
  const [seats, setSeats] = useState(1);
  const [name, setName] = useState(viewer.name);
  const [email, setEmail] = useState(viewer.email);
  const [phone, setPhone] = useState("");
  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  const [firstAttendeeTouched, setFirstAttendeeTouched] = useState(false);
  const [address, setAddress] = useState({ addressLine: "", zip: "", city: "" });
  const [paymentMethod, setPaymentMethod] = useState<WorkshopPaymentMethod | null>(
    offlineMethods[0] ?? null,
  );
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const rate = rates.find((entry) => entry.id === rateId) ?? null;
  const isPaid = Boolean(rate?.priceCents);
  const totalLabel = waitlist
    ? tx("0,00 € (erst beim Nachrücken)", "de")
    : rate?.priceCents
      ? formatEuro(rate.priceCents * seats)
      : tx("kostenlos", "de");
  const multipleNames = event.attendeeMode === "multiple";
  const namesFor = (index: number) =>
    index === 0 && !firstAttendeeTouched ? name : (attendeeNames[index] ?? "");
  const phoneInvalid = phone.trim() !== "" && !normalizePhone(phone);
  const duration = formatDuration(event.start, event.end);

  const submit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (submitting) return;
    setError(null);
    if (!acceptTerms) {
      setError(tx("Bitte bestätige die Teilnahme- und Stornobedingungen.", "de"));
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/workshops/${event.id}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateId,
          seats,
          applicant: { name, email, phone },
          // Bei einem Platz sind die Namensfelder ausgeblendet — dann zählt
          // der Name oben, auch wenn Platz 1 vorher bearbeitet wurde.
          attendeeNames: !multipleNames
            ? []
            : seats === 1
              ? [name]
              : Array.from({ length: seats }, (_, index) => namesFor(index)),
          address: event.addressMode === "none" ? null : address,
          paymentMethod: isPaid && !waitlist ? paymentMethod : null,
          acceptTerms,
          website,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        waitlisted?: boolean;
      };
      if (!response.ok) {
        throw new Error(
          payload.error || tx("Die Buchung hat nicht geklappt.", "de"),
        );
      }
      setResult({ waitlisted: Boolean(payload.waitlisted), email, seats, paid: isPaid });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : tx("Die Buchung hat nicht geklappt.", "de"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const facts = (
    <aside className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-[95px] lg:self-start">
      <div className="knglmrt-border-section bg-card">
        {event.imageUrl ? (
          // Campai liefert signierte S3-Adressen — kein next/image-Proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt=""
            className="aspect-[3/2] w-full object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {event.description ? (
            <p className="m-0 text-pretty">{event.description}</p>
          ) : null}
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">{tx("Wann", "de")}</dt>
            <dd className="m-0">
              {formatWeekday(event.start)}, {formatDate(event.start)}
              <br />
              <span className="knglmrt-num">
                {formatTimeRange(event.start, event.end)}
                {duration ? ` · ${duration}` : ""}
              </span>
            </dd>
            {event.placeName || event.placeAddress ? (
              <>
                <dt className="text-muted-foreground">{tx("Wo", "de")}</dt>
                <dd className="m-0">
                  {[event.placeName, event.placeAddress].filter(Boolean).join(", ")}
                </dd>
              </>
            ) : null}
            {event.maxAttendees ? (
              <>
                <dt className="text-muted-foreground">{tx("Plätze", "de")}</dt>
                <dd className="knglmrt-num m-0 self-center">
                  {tx("{{free}} von {{max}} frei", "de", {
                    free: event.free ?? event.maxAttendees,
                    max: event.maxAttendees,
                  })}
                </dd>
              </>
            ) : null}
            {event.minAttendees ? (
              <>
                <dt className="text-muted-foreground">{tx("Findet statt", "de")}</dt>
                <dd className="m-0">
                  {tx("ab {{count}} Anmeldungen", "de", { count: event.minAttendees })}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>

      {event.infoBlocks.map((block, index) => (
        <Notice key={index} tone="grau" title={block.title || undefined}>
          <p className="m-0 whitespace-pre-line text-pretty">{block.content}</p>
        </Notice>
      ))}

      {otherDates.length > 0 ? (
        <div>
          <p className="knglmrt-label m-0 mb-2">{tx("Weitere Termine", "de")}</p>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {otherDates.map((other) => (
              <li key={other.id}>
                <Link
                  href={`${overviewHref}/${other.id}`}
                  className="knglmrt-num knglmrt-border inline-block bg-card px-2.5 py-1.5 text-foreground no-underline transition hover:bg-primary-soft"
                >
                  {formatWeekdayShort(other.start)} {formatDayMonth(other.start)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );

  if (result) {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Notice tone={result.waitlisted ? "gelb" : "rosa"}>
            <div className="flex items-center gap-5" role="status">
              <Face number={result.waitlisted ? 8 : 5} size={72} title="" className="flex-none" />
              <div>
                <p className="knglmrt-card-title m-0">
                  {result.waitlisted
                    ? tx("Du stehst auf der Warteliste.", "de")
                    : tx("Gebucht – bis bald im Konglomerat!", "de")}
                </p>
                <p className="mb-0 mt-1.5 text-pretty">
                  {result.waitlisted
                    ? tx(
                        "Wird ein Platz frei, schreibt dir Campai an {{email}}. Dann hast du eine Weile Zeit, ihn anzunehmen.",
                        "de",
                        { email: result.email },
                      )
                    : result.paid
                      ? tx(
                          "Die Bestätigung kommt in den nächsten Minuten an {{email}}. Dort stehen auch die Infos zur Bezahlung und der Link zum Absagen.",
                          "de",
                          { email: result.email },
                        )
                      : tx(
                          "Die Bestätigung kommt in den nächsten Minuten an {{email}}. Dort steht auch der Link zum Absagen.",
                          "de",
                          { email: result.email },
                        )}
                </p>
              </div>
            </div>
          </Notice>
          <div className="flex flex-wrap gap-3">
            {!result.waitlisted ? (
              <Button
                href={buildIcsHref(event)}
                download={`${
                  event.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") ||
                  "workshop"
                }.ics`}
                kind="secondary"
                icon={faCalendarPlus}
              >
                {tx("In den Kalender", "de")}
              </Button>
            ) : null}
            <Button href={overviewHref} kind="quiet" icon={faArrowLeft}>
              {tx("Zu allen Workshops", "de")}
            </Button>
          </div>
          <p className="m-0 text-muted-foreground">
            {tx("Keine Mail bekommen? Schau im Spam-Ordner nach oder schreib an", "de")}{" "}
            <a href={`mailto:${WORKSHOP_BOOKING_EMAIL}`} className="knglmrt-num text-primary">
              {WORKSHOP_BOOKING_EMAIL}
            </a>
            .
          </p>
        </div>
        {facts}
      </div>
    );
  }

  if (action === "closed") {
    return (
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Notice tone="grau">
            <div className="flex items-center gap-5">
              <Face number={17} size={64} title="" className="flex-none" />
              <p className="m-0">
                {event.free === 0
                  ? tx("Dieser Termin ist ausgebucht.", "de")
                  : event.bookingOpensAt
                    ? tx("Die Anmeldung öffnet am {{date}}.", "de", {
                        date: formatDate(event.bookingOpensAt),
                      })
                    : tx("Für diesen Termin ist die Anmeldung geschlossen.", "de")}{" "}
                {otherDates.length > 0
                  ? tx("Schau dir die weiteren Termine an.", "de")
                  : null}
              </p>
            </div>
          </Notice>
          <div>
            <Button href={overviewHref} kind="quiet" icon={faArrowLeft}>
              {tx("Zu allen Workshops", "de")}
            </Button>
          </div>
        </div>
        {facts}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={submit} className="flex min-w-0 flex-col gap-6" noValidate={false}>
        {/* 1 — Plätze & Tarif */}
        <FormSection
          title={waitlist ? tx("1 · Warteliste", "de") : tx("1 · Plätze & Tarif", "de")}
        >
          <div className="flex flex-col gap-5">
            {waitlist ? (
              <Notice tone="gelb">
                <div className="flex items-center gap-4">
                  <Face number={8} size={56} title="" className="flex-none" />
                  <p className="m-0">
                    {tx(
                      "Ausgebucht. Trag dich auf die Warteliste ein – wird ein Platz frei, schreibt dir Campai.",
                      "de",
                    )}
                  </p>
                </div>
              </Notice>
            ) : null}

            {event.attendeeMode === "multiple" ? (
              <Stepper
                label={tx("Plätze", "de")}
                value={seats}
                min={1}
                max={maxSeats}
                onChange={setSeats}
                hint={
                  waitlist
                    ? tx("Plätze auf der Warteliste", "de")
                    : event.free !== null
                      ? tx("{{free}} von {{max}} noch frei", "de", {
                          free: event.free,
                          max: event.maxAttendees ?? event.free,
                        })
                      : undefined
                }
                className="max-w-[260px]"
              />
            ) : (
              <p className="m-0 text-muted-foreground">
                {tx("Eine Anmeldung gilt für eine Person.", "de")}
              </p>
            )}

            {rates.length > 1 ? (
              <ChoiceGroup label={tx("Tarif", "de")}>
                {rates.map((entry) => (
                  <Choice
                    key={entry.id}
                    kind="radio"
                    name="rate"
                    value={entry.id}
                    checked={rateId === entry.id}
                    onChange={() => setRateId(entry.id)}
                    label={
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span>{entry.name}</span>
                        <span className="knglmrt-num font-bold">
                          {formatPrice(entry.priceCents)}
                        </span>
                        {entry.memberOnly ? (
                          <Badge tone="gebucht">{tx("Mitglieder", "de")}</Badge>
                        ) : null}
                      </span>
                    }
                    hint={entry.description || undefined}
                  />
                ))}
              </ChoiceGroup>
            ) : rate ? (
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span>
                  <span className="knglmrt-label mr-3">{tx("Tarif", "de")}</span>
                  {rate.name}
                </span>
                <span className="knglmrt-num font-bold">{formatPrice(rate.priceCents)}</span>
              </div>
            ) : null}

            {hiddenMemberRates && !viewer.authenticated ? (
              <Notice tone="rosa">
                <p className="m-0">
                  {tx("Mitglied im Konglomerat?", "de")}{" "}
                  <Link href={loginHref} className="font-bold text-primary">
                    {tx("Melde dich an", "de")}
                  </Link>{" "}
                  {tx("– dann siehst du den Mitgliedertarif.", "de")}
                </p>
              </Notice>
            ) : null}
            {hiddenMemberRates && viewer.authenticated ? (
              <p className="m-0 text-muted-foreground">
                {tx(
                  "Den Mitgliedertarif gibt es, sobald dein Konto mit deiner Mitgliedschaft in Campai verknüpft ist.",
                  "de",
                )}
              </p>
            ) : null}
          </div>
        </FormSection>

        {/* 2 — Deine Daten */}
        <FormSection
          title={tx("2 · Deine Daten", "de")}
          description={
            viewer.authenticated
              ? tx("Aus deinem Konto übernommen – ändern geht.", "de")
              : isPaid && !waitlist
                ? tx("Hierhin schickt Campai Bestätigung und Rechnung.", "de")
                : tx("Hierhin schickt Campai die Bestätigung.", "de")
          }
        >
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label={tx("Name", "de")}
                required
                autoComplete="name"
                maxLength={81}
                value={name}
                onChange={(changeEvent) => setName(changeEvent.target.value)}
              />
              <Field
                label={tx("E-Mail", "de")}
                required
                type="email"
                autoComplete="email"
                maxLength={100}
                value={email}
                onChange={(changeEvent) => setEmail(changeEvent.target.value)}
              />
              <Field
                label={
                  event.requirePhone
                    ? tx("Telefon", "de")
                    : tx("Telefon (optional)", "de")
                }
                required={event.requirePhone}
                kind="mono"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                error={
                  phoneInvalid
                    ? tx("Bitte mit Vorwahl, etwa 0351 1234567.", "de")
                    : undefined
                }
              />
            </div>

            {multipleNames && seats > 1 ? (
              <div className="flex flex-col gap-3">
                <p className="knglmrt-label m-0">{tx("Wer kommt mit?", "de")}</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {Array.from({ length: seats }, (_, index) => (
                    <Field
                      key={index}
                      label={
                        index === 0
                          ? tx("Platz 1", "de")
                          : tx("Platz {{n}}", "de", { n: index + 1 })
                      }
                      required
                      maxLength={81}
                      value={namesFor(index)}
                      onChange={(changeEvent) => {
                        if (index === 0) setFirstAttendeeTouched(true);
                        const value = changeEvent.target.value;
                        setAttendeeNames((current) => {
                          const next = [...current];
                          next[index] = value;
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {event.addressMode !== "none" ? (
              <div className="flex flex-col gap-3">
                <p className="knglmrt-label m-0">
                  {event.addressMode === "required"
                    ? tx("Rechnungsadresse", "de")
                    : tx("Rechnungsadresse (optional)", "de")}
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_2fr]">
                  <Field
                    label={tx("Straße und Nr.", "de")}
                    required={event.addressMode === "required"}
                    autoComplete="street-address"
                    value={address.addressLine}
                    onChange={(changeEvent) =>
                      setAddress((current) => ({
                        ...current,
                        addressLine: changeEvent.target.value,
                      }))
                    }
                  />
                  <Field
                    label={tx("PLZ", "de")}
                    required={event.addressMode === "required"}
                    kind="mono"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={address.zip}
                    onChange={(changeEvent) =>
                      setAddress((current) => ({ ...current, zip: changeEvent.target.value }))
                    }
                  />
                  <Field
                    label={tx("Ort", "de")}
                    required={event.addressMode === "required"}
                    autoComplete="address-level2"
                    value={address.city}
                    onChange={(changeEvent) =>
                      setAddress((current) => ({ ...current, city: changeEvent.target.value }))
                    }
                  />
                </div>
              </div>
            ) : null}

            {/* Honeypot — für Menschen unsichtbar. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-px w-px opacity-0"
              value={website}
              onChange={(changeEvent) => setWebsite(changeEvent.target.value)}
            />
          </div>
        </FormSection>

        {/* 3 — Bezahlung */}
        {isPaid && !waitlist ? (
          <FormSection
            title={tx("3 · Bezahlung", "de")}
            description={
              event.paymentDueDays
                ? tx("Zahlbar innerhalb von {{days}} Tagen nach der Buchung.", "de", {
                    days: event.paymentDueDays,
                  })
                : undefined
            }
          >
            {offlineMethods.length > 0 ? (
              <ChoiceGroup label={tx("Wie möchtest du bezahlen?", "de")}>
                {offlineMethods.map((method) => (
                  <Choice
                    key={method}
                    kind="radio"
                    name="paymentMethod"
                    value={method}
                    checked={paymentMethod === method}
                    onChange={() => setPaymentMethod(method)}
                    label={tx(PAYMENT_METHOD_LABEL[method], "de")}
                    hint={
                      event.paymentNotes[method] ??
                      (method === "sepaCreditTransfer"
                        ? tx("Die Bankverbindung steht in der Bestätigungsmail.", "de")
                        : undefined)
                    }
                  />
                ))}
              </ChoiceGroup>
            ) : (
              <p className="m-0">
                {tx("Die Infos zur Bezahlung schickt dir Campai per Mail.", "de")}
              </p>
            )}
          </FormSection>
        ) : null}

        {/* 4 — Abschluss */}
        <FormSection
          title={
            isPaid && !waitlist ? tx("4 · Abschluss", "de") : tx("3 · Abschluss", "de")
          }
        >
          <div className="flex flex-col gap-5">
            {event.refundPolicies.length > 0 || event.refundText ? (
              <div>
                <p className="knglmrt-label m-0 mb-1.5">{tx("Stornobedingungen", "de")}</p>
                {event.refundPolicies.map((line) => (
                  <p key={line} className="m-0">
                    {line}
                  </p>
                ))}
                {event.refundText ? (
                  <p className="m-0 mt-1 whitespace-pre-line text-pretty text-muted-foreground">
                    {event.refundText}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-baseline justify-between gap-4 bg-muted px-3.5 py-3">
              <span className="font-bold">{tx("Gesamt", "de")}</span>
              <span className="knglmrt-num text-[length:var(--ui-size-body)] font-bold">
                {totalLabel}
              </span>
            </div>

            <Choice
              checked={acceptTerms}
              onChange={(changeEvent) => setAcceptTerms(changeEvent.target.checked)}
              label={
                waitlist
                  ? tx("Ich möchte auf die Warteliste. Rückt ein Platz frei, melde ich mich verbindlich an.", "de")
                  : event.refundPolicies.length > 0 || event.refundText
                    ? tx("Ich melde mich verbindlich an und akzeptiere die Stornobedingungen.", "de")
                    : tx("Ich melde mich verbindlich an.", "de")
              }
            />

            {error ? (
              <Notice tone="gelb">
                <p className="m-0" role="alert">
                  {error}
                </p>
              </Notice>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button href={overviewHref} kind="quiet">
                {tx("Abbrechen", "de")}
              </Button>
              <Button
                type="submit"
                kind="primary"
                size="medium"
                loading={submitting}
                disabled={!acceptTerms || phoneInvalid}
              >
                {waitlist
                  ? tx("Auf die Warteliste", "de")
                  : isPaid
                    ? tx("Kostenpflichtig buchen", "de")
                    : tx("Verbindlich anmelden", "de")}
              </Button>
            </div>
            <p className="m-0 text-muted-foreground">
              {tx(
                "Gebucht wird direkt in Campai, unserer Vereinsverwaltung. Bestätigung und Zahlungsinfos kommen per Mail.",
                "de",
              )}
            </p>
          </div>
        </FormSection>
      </form>
      {facts}
    </div>
  );
}
