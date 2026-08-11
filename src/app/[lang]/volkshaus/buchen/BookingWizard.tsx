"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faArrowRight,
  faArrowUpRightFromSquare,
  faCalendarCheck,
  faCalendarDays,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCircleInfo,
  faClipboardCheck,
  faClock,
  faDisplay,
  faDoorOpen,
  faEnvelope,
  faHouse,
  faLaptop,
  faListCheck,
  faLocationDot,
  faMicrophone,
  faMinus,
  faMusic,
  faPlug,
  faPlus,
  faReceipt,
  faScrewdriverWrench,
  faShieldHalved,
  faSliders,
  faTabletScreenButton,
  faTag,
  faTent,
  faTriangleExclamation,
  faUser,
  faUsers,
  faVolumeHigh,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import attendeesOneIllustration from "./assets/volkshaus-attendees-1.webp";
import attendeesTenIllustration from "./assets/volkshaus-attendees-10.webp";
import attendeesTwentyIllustration from "./assets/volkshaus-attendees-20.webp";
import attendeesFiftyIllustration from "./assets/volkshaus-attendees-50.webp";
import attendeesChaosIllustration from "./assets/volkshaus-attendees-chaos.webp";
import attendeesMoreIllustration from "./assets/volkshaus-attendees-more.webp";
import bookingHeroIllustration from "./assets/volkshaus-booking-hero.webp";
import bookingSuccessIllustration from "./assets/volkshaus-booking-success.webp";
import contactIllustration from "./assets/volkshaus-step-contact.webp";
import reviewIllustration from "./assets/volkshaus-step-review.webp";
import usageIllustration from "./assets/volkshaus-step-usage.webp";
import styles from "./BookingWizard.module.css";
import {
  VOLKSHAUS_EQUIPMENT,
  VOLKSHAUS_ROOMS,
  calculateDurationMinutes,
  calculateVolkshausPrice,
  findBusySlotConflicts,
  formatEuro,
  getMockBusySlots,
  getRoomLabel,
  type BusySlot,
  type VolkshausBookingFrequency,
  type VolkshausBookingRequestInput,
  type VolkshausEquipmentId,
  type VolkshausRoomId,
  type VolkshausUsageType,
} from "@/lib/volkshaus-booking";

type WizardState = Omit<
  VolkshausBookingRequestInput,
  "acceptedPrivacy" | "acceptedHouseRules"
> & {
  acceptedPrivacy: boolean;
  acceptedHouseRules: boolean;
};

type SubmissionResult = {
  referenceCode: string;
  accessUrl: string;
  notificationSent: boolean;
};

type AvailabilityResponse = {
  slots?: BusySlot[];
  notice?: string;
  error?: string;
};

const STEPS = [
  { label: "Termin & Räume", icon: faCalendarDays },
  { label: "Nutzung", icon: faHouse },
  { label: "Kontakt", icon: faEnvelope },
  { label: "Prüfen", icon: faReceipt },
] as const;

const STEP_ILLUSTRATIONS = [
  {
    src: bookingHeroIllustration,
    alt: "Zwei Figuren bereiten einen Raum für die Buchung vor",
  },
  {
    src: usageIllustration,
    alt: "Zwei Figuren planen gemeinsam eine Veranstaltung",
  },
  {
    src: contactIllustration,
    alt: "Zwei Figuren tauschen Kontaktdaten aus",
  },
  {
    src: reviewIllustration,
    alt: "Zwei Figuren prüfen gemeinsam die Angaben der Raumanfrage",
  },
] as const;

const ATTENDEE_PREVIEWS = [
  {
    min: 380,
    src: attendeesChaosIllustration,
    label: "Bist du sicher?",
    alt: "Fünf gezeichnete Personen in einem lustigen Chaos",
  },
  {
    min: 201,
    src: attendeesMoreIllustration,
    label: "Bist du sicher?",
    alt: "Eine sehr große gezeichnete Menschenmenge",
  },
  {
    min: 100,
    src: attendeesMoreIllustration,
    label: "Richtig was los!",
    alt: "Eine sehr große gezeichnete Menschenmenge",
  },
  {
    min: 50,
    src: attendeesFiftyIllustration,
    label: "Volles Haus",
    alt: "Eine große gezeichnete Gruppe mit etwa fünfzig Personen",
  },
  {
    min: 20,
    src: attendeesTwentyIllustration,
    label: "Schon ordentlich",
    alt: "Eine gezeichnete Gruppe mit etwa zwanzig Personen",
  },
  {
    min: 10,
    src: attendeesTenIllustration,
    label: "Kleine Runde",
    alt: "Eine gezeichnete Gruppe mit zehn Personen",
  },
  {
    min: 1,
    src: attendeesOneIllustration,
    label: "Ganz gemütlich",
    alt: "Eine einzelne gezeichnete Person",
  },
] as const;

const EQUIPMENT_VISUALS: Record<
  VolkshausEquipmentId,
  { icon: IconProp; className: string }
> = {
  projector: {
    icon: faDisplay,
    className:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  bluetooth_speaker: {
    icon: faMusic,
    className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  pa_system: {
    icon: faVolumeHigh,
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  mixer: {
    icon: faSliders,
    className:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  },
  microphone: {
    icon: faMicrophone,
    className: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
  laptop: {
    icon: faLaptop,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  tablet: {
    icon: faTabletScreenButton,
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  pavilion: {
    icon: faTent,
    className: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
  },
  cable_reel: {
    icon: faPlug,
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
};

const inputClassName =
  "w-full rounded-md border-0 bg-muted/45 px-3.5 py-3 text-sm text-foreground ring-1 ring-inset ring-border/70 transition placeholder:text-muted-foreground/70 hover:bg-muted/60 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/35";
const labelClassName = "mb-1.5 block text-sm font-semibold text-foreground";
const cardClassName =
  "rounded-lg bg-card p-5 shadow-[0_10px_30px_rgba(23,21,25,0.07)] ring-1 ring-foreground/5 md:p-7";
const sectionLabelClassName =
  "flex items-center gap-2 text-sm font-bold text-primary";

const fullDateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const monthLabelFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T12:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
};

const formatFullDate = (value: string) => {
  const date = parseIsoDate(value);
  return date ? fullDateFormatter.format(date) : "Bitte Datum auswählen";
};

const getMonthValue = (value: string) => {
  const date = parseIsoDate(value);
  return date ? date.toISOString().slice(0, 7) : null;
};

const shiftMonth = (monthValue: string, offset: number) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) {
    return monthValue;
  }

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1, 12),
  );
  return date.toISOString().slice(0, 7);
};

const createCalendarDays = (monthValue: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue);
  if (!match) {
    return [];
  }

  const firstOfMonth = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 12),
  );
  const mondayBasedOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const firstCalendarDay = new Date(firstOfMonth);
  firstCalendarDay.setUTCDate(
    firstCalendarDay.getUTCDate() - mondayBasedOffset,
  );

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCalendarDay);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
};

const buildInitialState = (initialDate: string): WizardState => ({
  customerName: "",
  organization: "",
  email: "",
  phone: "",
  billingAddressLine: "",
  billingZip: "",
  billingCity: "Dresden",
  eventTitle: "",
  eventDescription: "",
  usageType: "commercial",
  frequency: "one_time",
  recurringOccurrences: 1,
  expectedAttendees: 20,
  bookingDate: initialDate,
  startTime: "18:00",
  endTime: "21:00",
  setupStartTime: "17:00",
  teardownEndTime: "22:00",
  requestedRooms: ["saal"],
  equipment: {},
  specialRequirements: "",
  acceptedPrivacy: false,
  acceptedHouseRules: false,
  website: "",
});

const buildTestState = (initialDate: string): WizardState => ({
  ...buildInitialState(initialDate),
  customerName: "Max Mustermann",
  organization: "Testverein Dresden e. V.",
  email: `volkshaus-test-${initialDate.replaceAll("-", "")}@example.com`,
  phone: "+49 351 1234567",
  billingAddressLine: "Musterstraße 12",
  billingZip: "01159",
  eventTitle: "Testveranstaltung im Volkshaus",
  eventDescription:
    "Dies ist eine automatisch ausgefüllte Testanfrage für die Prüfung des Buchungsablaufs.",
  usageType: "neighborhood",
  expectedAttendees: 20,
  startTime: "09:00",
  endTime: "11:00",
  setupStartTime: "08:30",
  teardownEndTime: "11:30",
  equipment: {
    projector: 1,
    cable_reel: 1,
  },
  specialRequirements:
    "Testhinweis: Bitte die gewünschte Bestuhlung und den Technikaufbau prüfen.",
  acceptedPrivacy: true,
  acceptedHouseRules: true,
});

export default function BookingWizard({
  initialDate,
}: {
  initialDate: string;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(() =>
    buildInitialState(initialDate),
  );
  const [availabilitySlots, setAvailabilitySlots] = useState<BusySlot[]>([]);
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<SubmissionResult | null>(null);

  const price = useMemo(() => calculateVolkshausPrice(form), [form]);
  const requestedStart = form.setupStartTime || form.startTime;
  const requestedEnd = form.teardownEndTime || form.endTime;
  const conflicts = useMemo(
    () =>
      findBusySlotConflicts({
        slots: availabilitySlots,
        requestedRooms: form.requestedRooms,
        startTime: requestedStart,
        endTime: requestedEnd,
      }),
    [availabilitySlots, form.requestedRooms, requestedEnd, requestedStart],
  );
  const capacity = useMemo(
    () =>
      form.requestedRooms.reduce((sum, roomId) => {
        const room = VOLKSHAUS_ROOMS.find((entry) => entry.id === roomId);
        return sum + (room?.capacity ?? 0);
      }, 0),
    [form.requestedRooms],
  );
  const hasUnboundedCapacityRoom = form.requestedRooms.some(
    (roomId) =>
      VOLKSHAUS_ROOMS.find((entry) => entry.id === roomId)?.capacity === null,
  );
  const capacityWarning =
    !hasUnboundedCapacityRoom &&
    capacity > 0 &&
    form.expectedAttendees > capacity;

  useEffect(() => {
    if (!parseIsoDate(form.bookingDate)) {
      setAvailabilitySlots([]);
      setAvailabilityNotice("");
      setAvailabilityError(null);
      setIsLoadingAvailability(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingAvailability(true);
    setAvailabilityError(null);

    void fetch(
      `/api/volkshaus/availability?date=${encodeURIComponent(form.bookingDate)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const data = (await response.json()) as AvailabilityResponse;
        if (!response.ok) {
          throw new Error(
            data.error ?? "Kalender konnte nicht geladen werden.",
          );
        }
        setAvailabilitySlots(data.slots ?? []);
        setAvailabilityNotice(data.notice ?? "");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setAvailabilityError(
          error instanceof Error
            ? error.message
            : "Kalender konnte nicht geladen werden.",
        );
        setAvailabilitySlots(getMockBusySlots(form.bookingDate));
      })
      .finally(() => setIsLoadingAvailability(false));

    return () => controller.abort();
  }, [form.bookingDate]);

  const setField = <Key extends keyof WizardState>(
    key: Key,
    value: WizardState[Key],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setStepError(null);
    setSubmitError(null);
  };

  const toggleRoom = (roomId: VolkshausRoomId) => {
    setForm((current) => {
      const requestedRooms = current.requestedRooms.includes(roomId)
        ? current.requestedRooms.filter((entry) => entry !== roomId)
        : [...current.requestedRooms, roomId];
      return { ...current, requestedRooms };
    });
    setStepError(null);
  };

  const setEquipmentQuantity = (
    equipmentId: VolkshausEquipmentId,
    quantity: number,
  ) => {
    setForm((current) => ({
      ...current,
      equipment: {
        ...current.equipment,
        [equipmentId]: Math.max(0, quantity),
      },
    }));
  };

  const validateStep = (currentStep: number) => {
    if (currentStep === 0) {
      if (!parseIsoDate(form.bookingDate)) {
        return "Bitte wähle ein gültiges Datum.";
      }
      if (form.bookingDate < initialDate) {
        return "Bitte wähle einen zukünftigen Termin.";
      }
      if (form.requestedRooms.length === 0) {
        return "Bitte wähle mindestens einen Raum.";
      }
      if (calculateDurationMinutes(form.startTime, form.endTime) < 60) {
        return "Die Veranstaltungszeit muss mindestens eine Stunde dauern.";
      }
      if (form.setupStartTime && form.setupStartTime > form.startTime) {
        return "Der Aufbau muss vor dem Veranstaltungsbeginn liegen.";
      }
      if (form.teardownEndTime && form.teardownEndTime < form.endTime) {
        return "Die Rückgabe muss nach dem Veranstaltungsende liegen.";
      }
      if (conflicts.length > 0) {
        return "Der gewählte Zeitraum überschneidet sich mit einer Belegung.";
      }
    }
    if (currentStep === 1) {
      if (!form.eventTitle.trim()) {
        return "Bitte gib der Veranstaltung einen Titel.";
      }
      if (!form.eventDescription.trim()) {
        return "Bitte beschreibe kurz, was im Volkshaus stattfinden soll.";
      }
      if (form.expectedAttendees < 1) {
        return "Bitte gib die erwartete Personenzahl an.";
      }
    }
    if (currentStep === 2) {
      if (!form.customerName.trim()) return "Bitte gib deinen Namen an.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        return "Bitte gib eine gültige E-Mail-Adresse an.";
      }
      if (
        !form.billingAddressLine.trim() ||
        !form.billingZip.trim() ||
        !form.billingCity.trim()
      ) {
        return "Bitte vervollständige die Rechnungsanschrift.";
      }
      if (!form.acceptedPrivacy || !form.acceptedHouseRules) {
        return "Bitte bestätige Datenschutz, Leitbild und Hausordnung.";
      }
    }
    return null;
  };

  const goNext = () => {
    const error = validateStep(step);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const goBack = () => {
    setStepError(null);
    setStep((current) => Math.max(0, current - 1));
  };

  const fillTestForm = () => {
    setForm(buildTestState(initialDate));
    setStepError(null);
    setSubmitError(null);
  };

  const submit = async () => {
    for (let currentStep = 0; currentStep < 3; currentStep += 1) {
      const error = validateStep(currentStep);
      if (error) {
        setStep(currentStep);
        setStepError(error);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/volkshaus/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json().catch(() => ({}))) as
        | (SubmissionResult & { error?: string })
        | { error?: string };
      if (!response.ok) {
        throw new Error(
          data.error ?? "Anfrage konnte nicht gespeichert werden.",
        );
      }
      setSubmission(data as SubmissionResult);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Anfrage konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submission) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-4 md:py-10">
        <section className="overflow-hidden rounded-lg border border-success-border bg-card shadow-sm">
          <div className="bg-success-soft p-8 text-center md:p-12">
            <Image
              src={bookingSuccessIllustration}
              alt="Zwei Figuren feiern die erfolgreiche Raumanfrage"
              className="mx-auto -mt-4 h-auto w-full max-w-xl multiply negative-multiply"
            />
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-success">
              <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
              Anfrage gespeichert
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-5xl">
              Danke für deine Anfrage
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Die Anfrage ist noch keine verbindliche Reservierung. Das
              Volkshaus-Team prüft Termin, Nutzung und Preis.
            </p>
          </div>
          <div className="space-y-5 p-6 md:p-8">
            <div className="rounded-lg border border-border bg-muted/40 p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Deine Referenz
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-foreground">
                {submission.referenceCode}
              </p>
            </div>
            {!submission.notificationSent ? (
              <div className="flex gap-3 rounded-lg border border-warning-border bg-warning-soft p-4 text-sm text-warning">
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <p>
                  Der E-Mail-Versand ist in dieser Umgebung noch nicht
                  konfiguriert. Speichere deshalb den persönlichen Link.
                </p>
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Eine Zusammenfassung wurde an deine E-Mail-Adresse gesendet.
              </p>
            )}
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                href={submission.accessUrl}
                kind="primary"
                size="large"
                icon={faArrowUpRightFromSquare}
              >
                Anfrage öffnen
              </Button>
              <Button
                href="/volkshaus/buchen"
                kind="secondary"
                size="large"
                icon={faPlus}
              >
                Weitere Anfrage
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 py-2 md:py-6">
      <header className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,480px)] md:gap-8">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-base font-bold text-primary">
            <FontAwesomeIcon icon={faHouse} className="h-3.5 w-3.5" />
            Neues Volkshaus Cotta
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground md:text-6xl">
            Raum anfragen
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Erzähl uns, wann du kommen möchtest und was du vorhast. Du siehst
            direkt, was es ungefähr kostet. Verbindlich wird die Buchung erst,
            wenn alles geprüft ist und du die bereits von uns unterschriebene
            Vereinbarung unterschrieben hast.
          </p>
          <div
            role="note"
            aria-label="Wichtiger Zahlungshinweis"
            className="mt-5 flex max-w-2xl items-center gap-3 rounded-lg border border-warning-border bg-warning-soft px-4 py-3.5 text-warning shadow-sm"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning/10">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="h-4 w-4"
              />
            </span>
            <p className="text-base font-black leading-snug md:text-lg">
              Bitte bezahlen bis 3 Tage vor Buchung.
            </p>
          </div>
          <div className="mt-5">
            <Button
              kind="secondary"
              size="medium"
              icon={faClipboardCheck}
              onClick={fillTestForm}
            >
              Testformular ausfüllen
            </Button>
          </div>
        </div>
        <Image
          key={step}
          src={STEP_ILLUSTRATIONS[step].src}
          alt={STEP_ILLUSTRATIONS[step].alt}
          priority
          className={`${styles.stepIllustration} mx-auto h-auto w-full max-w-sm multiply negative-multiply md:max-w-none`}
        />
      </header>

      <nav
        aria-label="Fortschritt der Raumanfrage"
        className="max-w-4xl lg:hidden"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <FontAwesomeIcon icon={STEPS[step].icon} className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm text-muted-foreground">
              Schritt {step + 1} von {STEPS.length}
            </p>
            <p className="font-black text-foreground">{STEPS[step].label}</p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={`Schritt ${step + 1} von ${STEPS.length}`}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <ol className="mt-2 hidden grid-cols-4 gap-3 sm:grid">
          {STEPS.map((entry, index) => (
            <li
              key={entry.label}
              aria-current={index === step ? "step" : undefined}
              className={`text-xs font-semibold ${
                index <= step ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {index < step ? (
                <FontAwesomeIcon
                  icon={faCheck}
                  className="mr-1.5 h-2.5 w-2.5 text-success"
                />
              ) : null}
              {entry.label}
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {step === 0 ? (
            <BookingTimeStep
              form={form}
              setField={setField}
              toggleRoom={toggleRoom}
              minimumDate={initialDate}
              slots={availabilitySlots}
              isLoading={isLoadingAvailability}
              notice={availabilityNotice}
              error={availabilityError}
              conflicts={conflicts}
              capacityWarning={capacityWarning}
              capacity={capacity}
            />
          ) : null}

          {step === 1 ? (
            <UsageStep
              form={form}
              setField={setField}
              setEquipmentQuantity={setEquipmentQuantity}
              capacityWarning={capacityWarning}
            />
          ) : null}

          {step === 2 ? <ContactStep form={form} setField={setField} /> : null}

          {step === 3 ? <ReviewStep form={form} price={price} /> : null}

          {stepError ? (
            <div className="flex gap-3 rounded-lg border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <p>{stepError}</p>
            </div>
          ) : null}

          {submitError ? (
            <div className="flex gap-3 rounded-lg border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <p>{submitError}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {step > 0 ? (
              <Button
                kind="secondary"
                size="large"
                icon={faArrowLeft}
                onClick={goBack}
              >
                Zurück
              </Button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <Button
                kind="primary"
                size="large"
                icon={faArrowRight}
                iconPosition="right"
                onClick={goNext}
              >
                Weiter
              </Button>
            ) : (
              <Button
                kind="primary"
                size="large"
                icon={faCheck}
                onClick={() => void submit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Wird gespeichert …" : "Anfrage absenden"}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <PriceSummary price={price} form={form} />

          <nav
            aria-label="Fortschritt der Raumanfrage"
            className="hidden rounded-lg bg-card p-5 shadow-[0_10px_30px_rgba(23,21,25,0.07)] ring-1 ring-foreground/5 lg:block"
          >
            <p className="text-sm text-muted-foreground">
              Schritt {step + 1} von {STEPS.length}
            </p>
            <p className="mt-0.5 font-black text-foreground">
              Deine Raumanfrage
            </p>

            <ol className="mt-5">
              {STEPS.map((entry, index) => {
                const isActive = index === step;
                const isComplete = index < step;

                return (
                  <li
                    key={entry.label}
                    aria-current={isActive ? "step" : undefined}
                    className="relative flex gap-3 pb-5 last:pb-0"
                  >
                    {index < STEPS.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[1.1rem] top-9 h-[calc(100%-1rem)] w-px ${
                          isComplete ? "bg-success" : "bg-border"
                        }`}
                      />
                    ) : null}
                    <span
                      className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : isComplete
                            ? "bg-success-soft text-success"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <FontAwesomeIcon
                        icon={isComplete ? faCheck : entry.icon}
                        className="h-3.5 w-3.5"
                      />
                    </span>
                    <span className="pt-0.5">
                      <span
                        className={`block text-sm font-bold ${
                          isActive ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {entry.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {isComplete
                          ? "Erledigt"
                          : isActive
                            ? "Gerade hier"
                            : "Danach"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </div>
    </div>
  );
}

type SetField = <Key extends keyof WizardState>(
  key: Key,
  value: WizardState[Key],
) => void;

function BookingTimeStep({
  form,
  setField,
  toggleRoom,
  minimumDate,
  slots,
  isLoading,
  notice,
  error,
  conflicts,
  capacityWarning,
  capacity,
}: {
  form: WizardState;
  setField: SetField;
  toggleRoom: (roomId: VolkshausRoomId) => void;
  minimumDate: string;
  slots: BusySlot[];
  isLoading: boolean;
  notice: string;
  error: string | null;
  conflicts: BusySlot[];
  capacityWarning: boolean;
  capacity: number;
}) {
  const minimumMonth =
    getMonthValue(minimumDate) ?? new Date().toISOString().slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(
    () => getMonthValue(form.bookingDate) ?? minimumMonth,
  );
  const calendarDays = useMemo(
    () => createCalendarDays(visibleMonth),
    [visibleMonth],
  );
  const visibleMonthDate =
    parseIsoDate(`${visibleMonth}-01`) ??
    new Date(`${minimumMonth}-01T12:00:00Z`);
  const hasValidBookingDate = Boolean(parseIsoDate(form.bookingDate));

  return (
    <>
      <section className={cardClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={sectionLabelClassName}>
              <FontAwesomeIcon icon={faCalendarDays} className="h-3 w-3" />
              Dein Termin
            </p>
            <h2 className="mt-1 text-2xl font-black text-foreground">
              Wann passt es für dich?
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft/70 px-3 py-1.5 text-xs font-bold text-warning">
            <FontAwesomeIcon icon={faCalendarCheck} className="h-3 w-3" />
            Beispielkalender
          </span>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg bg-muted/25 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <p className="font-black capitalize text-foreground">
                {monthLabelFormatter.format(visibleMonthDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Vorheriger Monat"
                title="Vorheriger Monat"
                disabled={visibleMonth <= minimumMonth}
                onClick={() =>
                  setVisibleMonth((current) => shiftMonth(current, -1))
                }
                className="flex h-10 w-10 items-center justify-center rounded-md bg-card text-foreground shadow-sm ring-1 ring-foreground/5 transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
              </button>
              <label className="relative">
                <span className="sr-only">Monat direkt auswählen</span>
                <input
                  type="month"
                  min={minimumMonth}
                  value={visibleMonth}
                  onChange={(event) => {
                    if (event.target.value) {
                      setVisibleMonth(event.target.value);
                    }
                  }}
                  className="h-10 rounded-md border-0 bg-card px-3 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-foreground/10 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <button
                type="button"
                aria-label="Nächster Monat"
                title="Nächster Monat"
                onClick={() =>
                  setVisibleMonth((current) => shiftMonth(current, 1))
                }
                className="flex h-10 w-10 items-center justify-center rounded-md bg-card text-foreground shadow-sm ring-1 ring-foreground/5 transition hover:text-primary"
              >
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="h-3.5 w-3.5"
                />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-y border-border/60">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((weekday) => (
              <span
                key={weekday}
                className="py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground"
              >
                {weekday}
              </span>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarDays.map((date) => {
              const dateValue = parseIsoDate(date);
              if (!dateValue) {
                return null;
              }

              const busyCount = getMockBusySlots(date).filter((slot) =>
                form.requestedRooms.includes(slot.roomId),
              ).length;
              const isSelected = form.bookingDate === date;
              const isCurrentMonth = date.startsWith(visibleMonth);
              const isBeforeMinimum = date < minimumDate;
              const availabilityLabel =
                busyCount > 0
                  ? `${busyCount} Belegung${busyCount > 1 ? "en" : ""}`
                  : "frei";

              return (
                <button
                  key={date}
                  type="button"
                  disabled={isBeforeMinimum}
                  aria-label={`${fullDateFormatter.format(dateValue)}, ${
                    isBeforeMinimum ? "nicht auswählbar" : availabilityLabel
                  }`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setField("bookingDate", date);
                    if (!isCurrentMonth) {
                      setVisibleMonth(date.slice(0, 7));
                    }
                  }}
                  className={`group flex min-h-16 flex-col items-center justify-center px-1 py-2 text-center transition ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isCurrentMonth
                        ? "bg-card text-foreground shadow-sm hover:bg-primary-soft hover:text-primary"
                        : "bg-transparent text-muted-foreground hover:bg-primary-soft"
                  } rounded-md disabled:cursor-not-allowed disabled:bg-transparent disabled:text-muted-foreground/30 disabled:shadow-none`}
                >
                  <span className="text-sm font-bold">
                    {dateValue.getUTCDate()}
                  </span>
                  {!isBeforeMinimum ? (
                    <span
                      className={`mt-1.5 flex items-center gap-1 text-[0.6rem] font-semibold ${
                        isSelected
                          ? "text-primary-foreground/85"
                          : busyCount > 0
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected
                            ? "bg-primary-foreground"
                            : busyCount > 0
                              ? "bg-warning"
                              : "bg-success"
                        }`}
                      />
                      <span className="hidden sm:inline">
                        {busyCount > 0 ? `${busyCount} belegt` : "frei"}
                      </span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-5">
          <label className="md:col-span-2">
            <span className={labelClassName}>Datum</span>
            <input
              className={inputClassName}
              type="date"
              min={minimumDate}
              value={form.bookingDate}
              onChange={(event) => {
                const value = event.target.value;
                setField("bookingDate", value);
                const selectedMonth = getMonthValue(value);
                if (selectedMonth) {
                  setVisibleMonth(selectedMonth);
                }
              }}
            />
          </label>
          <label>
            <span className={labelClassName}>Beginn</span>
            <input
              className={inputClassName}
              type="time"
              value={form.startTime}
              onChange={(event) => setField("startTime", event.target.value)}
            />
          </label>
          <label>
            <span className={labelClassName}>Ende</span>
            <input
              className={inputClassName}
              type="time"
              value={form.endTime}
              onChange={(event) => setField("endTime", event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <div className="flex w-full items-center justify-center gap-2 rounded-md bg-muted/45 px-3 py-3 text-center text-sm font-semibold text-foreground ring-1 ring-inset ring-border/70">
              <FontAwesomeIcon
                icon={faClock}
                className="h-3.5 w-3.5 text-muted-foreground"
              />
              {Math.max(
                0,
                calculateDurationMinutes(form.startTime, form.endTime) / 60,
              ).toLocaleString("de-DE", {
                maximumFractionDigits: 1,
              })}{" "}
              Std.
            </div>
          </div>
        </div>

        <details className="mt-4 rounded-md bg-muted/35 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            <FontAwesomeIcon
              icon={faClock}
              className="mr-2 h-3.5 w-3.5 text-primary"
            />
            Zusätzliche Zeit für Aufbau und Rückgabe
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClassName}>Aufbau ab</span>
              <input
                className={inputClassName}
                type="time"
                value={form.setupStartTime ?? ""}
                onChange={(event) =>
                  setField("setupStartTime", event.target.value || null)
                }
              />
            </label>
            <label>
              <span className={labelClassName}>Rückgabe bis</span>
              <input
                className={inputClassName}
                type="time"
                value={form.teardownEndTime ?? ""}
                onChange={(event) =>
                  setField("teardownEndTime", event.target.value || null)
                }
              />
            </label>
          </div>
        </details>
      </section>

      <section className={cardClassName}>
        <div>
          <p className={sectionLabelClassName}>
            <FontAwesomeIcon icon={faDoorOpen} className="h-3 w-3" />
            Deine Räume
          </p>
          <h2 className="mt-1 text-2xl font-black text-foreground">
            Was passt zu deinem Vorhaben?
          </h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {VOLKSHAUS_ROOMS.map((room) => {
            const selected = form.requestedRooms.includes(room.id);
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => toggleRoom(room.id)}
                className={`relative rounded-md p-4 text-left ring-1 ring-inset transition ${
                  selected
                    ? "bg-primary-soft/70 ring-primary/30"
                    : "bg-muted/25 ring-foreground/5 hover:bg-primary-soft/40"
                }`}
              >
                <span
                  className={`absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full border ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input text-transparent"
                  }`}
                >
                  <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                </span>
                <span className="flex items-center gap-2 pr-8 font-bold text-foreground">
                  <FontAwesomeIcon
                    icon={faDoorOpen}
                    className="h-3.5 w-3.5 text-primary"
                  />
                  <span>{room.label}</span>
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                  {room.description}
                </span>
                {room.capacity ? (
                  <span className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <FontAwesomeIcon icon={faUsers} className="h-3 w-3" />
                    maximal {room.capacity} Personen
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {capacityWarning ? (
          <div className="mt-4 flex gap-3 rounded-lg border border-warning-border bg-warning-soft p-4 text-sm text-warning">
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <p>
              Die gewählten Innenräume sind regulär für insgesamt {capacity}{" "}
              Personen ausgelegt. Das Team prüft deine Anfrage individuell.
            </p>
          </div>
        ) : null}
      </section>

      <section className={cardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={sectionLabelClassName}>
              <FontAwesomeIcon icon={faCalendarCheck} className="h-3 w-3" />
              Belegung
            </p>
            <h2 className="mt-1 text-xl font-black text-foreground">
              {hasValidBookingDate
                ? `So sieht es am ${formatFullDate(form.bookingDate)} aus`
                : "Wähle zuerst ein Datum"}
            </h2>
          </div>
          {!hasValidBookingDate ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-3 py-1 text-xs font-bold text-warning">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="h-3 w-3"
              />
              Datum fehlt
            </span>
          ) : isLoading ? (
            <span className="text-xs text-muted-foreground">lädt …</span>
          ) : conflicts.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive-soft px-3 py-1 text-xs font-bold text-destructive">
              <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
              Überschneidung
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-3 py-1 text-xs font-bold text-success">
              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
              Zeitraum frei
            </span>
          )}
        </div>

        {error ? (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        ) : null}

        {hasValidBookingDate ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {form.requestedRooms.map((roomId) => {
              const roomSlots = slots.filter((slot) => slot.roomId === roomId);
              return (
                <div
                  key={roomId}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <p className="flex items-center gap-2 font-bold text-foreground">
                    <FontAwesomeIcon
                      icon={faDoorOpen}
                      className="h-3.5 w-3.5 text-primary"
                    />
                    {getRoomLabel(roomId)}
                  </p>
                  {roomSlots.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {roomSlots.map((slot) => (
                        <li
                          key={slot.id}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <FontAwesomeIcon
                            icon={faClock}
                            className="h-3.5 w-3.5 text-warning"
                          />
                          {slot.startTime}–{slot.endTime} belegt
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 flex items-center gap-2 text-sm text-success">
                      <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                      Keine Belegung hinterlegt
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 border border-dashed border-border bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            Wähle oben ein Datum aus, um die Belegungen der Räume zu prüfen.
          </p>
        )}
        {hasValidBookingDate && notice ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </section>
    </>
  );
}

function UsageStep({
  form,
  setField,
  setEquipmentQuantity,
  capacityWarning,
}: {
  form: WizardState;
  setField: SetField;
  setEquipmentQuantity: (
    equipmentId: VolkshausEquipmentId,
    quantity: number,
  ) => void;
  capacityWarning: boolean;
}) {
  const selectedEquipmentCount = VOLKSHAUS_EQUIPMENT.reduce(
    (total, item) => total + Number(form.equipment[item.id] ?? 0),
    0,
  );
  const attendeeCount = Math.min(400, Math.max(1, form.expectedAttendees));
  const attendeePreview =
    ATTENDEE_PREVIEWS.find((preview) => attendeeCount >= preview.min) ??
    ATTENDEE_PREVIEWS.at(-1)!;
  const attendeeSliderProgress = ((attendeeCount - 1) / 399) * 100;

  return (
    <>
      <section className={cardClassName}>
        <p className={sectionLabelClassName}>
          <FontAwesomeIcon icon={faTag} className="h-3 w-3" />
          Dein Vorhaben
        </p>
        <h2 className="mt-1 text-2xl font-black text-foreground">
          Was hast du vor?
        </h2>
        <div className="mt-6 grid gap-5">
          <label>
            <span className={labelClassName}>Titel der Veranstaltung</span>
            <input
              className={inputClassName}
              value={form.eventTitle}
              maxLength={180}
              placeholder="z. B. Nachbarschaftscafé oder Workshop"
              onChange={(event) => setField("eventTitle", event.target.value)}
            />
          </label>
          <label>
            <span className={labelClassName}>Beschreibung und Zweck</span>
            <textarea
              className={`${inputClassName} min-h-32 resize-y`}
              value={form.eventDescription}
              maxLength={4_000}
              placeholder="Was findet statt, für wen ist das Angebot und ist es öffentlich zugänglich?"
              onChange={(event) =>
                setField("eventDescription", event.target.value)
              }
            />
          </label>
          <div className="grid gap-5 md:grid-cols-2">
            <label>
              <span className={labelClassName}>Art der Nutzung</span>
              <select
                className={inputClassName}
                value={form.usageType}
                onChange={(event) =>
                  setField(
                    "usageType",
                    event.target.value as VolkshausUsageType,
                  )
                }
              >
                <option value="commercial">
                  Privat, kommerziell oder gewerblich
                </option>
                <option value="neighborhood">
                  Nichtkommerziell und nachbarschaftlich
                </option>
              </select>
            </label>
            <label>
              <span className={labelClassName}>Häufigkeit</span>
              <select
                className={inputClassName}
                value={form.frequency}
                onChange={(event) =>
                  setField(
                    "frequency",
                    event.target.value as VolkshausBookingFrequency,
                  )
                }
              >
                <option value="one_time">Einmalige Nutzung</option>
                <option value="recurring">Regelmäßiges Angebot</option>
              </select>
            </label>
            {form.frequency === "recurring" ? (
              <label>
                <span className={labelClassName}>Termine pro Monat</span>
                <select
                  className={inputClassName}
                  value={form.recurringOccurrences}
                  onChange={(event) =>
                    setField(
                      "recurringOccurrences",
                      Number.parseInt(event.target.value, 10),
                    )
                  }
                >
                  {[1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {count} × pro Monat
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-muted/35 p-4 md:p-5">
            <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <label
                      htmlFor="expected-attendees"
                      className={labelClassName}
                    >
                      Erwartete Personen
                    </label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Zieh den Regler, bis es ungefähr passt.
                    </p>
                  </div>
                  <output
                    htmlFor="expected-attendees"
                    className="min-w-20 rounded-md bg-primary px-3 py-2 text-center text-primary-foreground shadow-sm"
                  >
                    <span className="block text-2xl font-black leading-none">
                      {attendeeCount}
                    </span>
                    <span className="mt-1 block text-[11px] font-bold">
                      {attendeeCount === 1 ? "Person" : "Personen"}
                    </span>
                  </output>
                </div>
                <input
                  id="expected-attendees"
                  className={`${styles.attendeeRange} mt-7`}
                  type="range"
                  min={1}
                  max={400}
                  step={1}
                  value={attendeeCount}
                  aria-valuetext={`${attendeeCount} ${
                    attendeeCount === 1 ? "Person" : "Personen"
                  }`}
                  style={{
                    background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${attendeeSliderProgress}%, var(--muted) ${attendeeSliderProgress}%, var(--muted) 100%)`,
                  }}
                  onChange={(event) =>
                    setField(
                      "expectedAttendees",
                      Number.parseInt(event.target.value, 10),
                    )
                  }
                />
                <div
                  aria-hidden="true"
                  className="mt-2 flex justify-between text-xs font-bold text-muted-foreground"
                >
                  <span>1</span>
                  <span>400</span>
                </div>
              </div>
              <figure className="flex min-h-36 flex-col items-center justify-center rounded-md bg-card px-3 py-2 text-center shadow-sm">
                <Image
                  key={attendeePreview.min}
                  src={attendeePreview.src}
                  alt={attendeePreview.alt}
                  className={`${styles.attendeePreview} h-24 w-full object-contain multiply negative-multiply`}
                  sizes="180px"
                />
                <figcaption className="mt-1 text-sm font-black text-foreground">
                  {attendeePreview.label}
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
        {capacityWarning ? (
          <p className="mt-4 text-sm text-warning">
            Die Personenzahl liegt über der regulären Kapazität der gewählten
            Innenräume.
          </p>
        ) : null}
      </section>

      <section className={cardClassName}>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <p className={sectionLabelClassName}>
                <FontAwesomeIcon
                  icon={faScrewdriverWrench}
                  className="h-3 w-3"
                />
                Optional
              </p>
              <h2 className="mt-1 text-xl font-black text-foreground">
                Technik oder Material hinzufügen
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedEquipmentCount > 0
                  ? `${selectedEquipmentCount} Position${selectedEquipmentCount > 1 ? "en" : ""} ausgewählt`
                  : "Nur öffnen, wenn du etwas davon brauchst."}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/45 text-muted-foreground">
              <FontAwesomeIcon
                icon={faChevronRight}
                className="h-3 w-3 transition-transform group-open:rotate-90"
              />
            </span>
          </summary>

          <div className="mt-5 divide-y divide-border">
            {VOLKSHAUS_EQUIPMENT.map((item) => {
              const quantity = Number(form.equipment[item.id] ?? 0);
              const visual = EQUIPMENT_VISUALS[item.id];
              const mixerIncluded =
                item.id === "mixer" &&
                Number(form.equipment.pa_system ?? 0) > 0;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${visual.className}`}
                    >
                      <FontAwesomeIcon icon={visual.icon} className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {mixerIncluded
                          ? "In der PA-Anlage enthalten"
                          : item.included
                            ? "ohne Aufpreis"
                            : `${formatEuro(item.unitNetCents)} netto`}
                        {item.description ? ` · ${item.description}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`${item.label} verringern`}
                      disabled={quantity <= 0}
                      onClick={() =>
                        setEquipmentQuantity(item.id, quantity - 1)
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground ring-1 ring-inset ring-border transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <FontAwesomeIcon icon={faMinus} className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-foreground">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`${item.label} erhöhen`}
                      disabled={quantity >= item.maxQuantity}
                      onClick={() =>
                        setEquipmentQuantity(item.id, quantity + 1)
                      }
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground ring-1 ring-inset ring-border transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </section>

      <details className={`${cardClassName} group`}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
          <div>
            <p className={sectionLabelClassName}>
              <FontAwesomeIcon icon={faListCheck} className="h-3 w-3" />
              Optional
            </p>
            <h2 className="mt-1 text-xl font-black text-foreground">
              Wünsche oder Hinweise
            </h2>
            {form.specialRequirements ? (
              <p className="mt-1 text-sm text-success">Hinweis hinzugefügt</p>
            ) : null}
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/45 text-muted-foreground">
            <FontAwesomeIcon
              icon={faChevronRight}
              className="h-3 w-3 transition-transform group-open:rotate-90"
            />
          </span>
        </summary>
        <label className="mt-5 block">
          <span className={labelClassName}>Was sollen wir noch wissen?</span>
          <textarea
            className={`${inputClassName} min-h-28 resize-y`}
            value={form.specialRequirements ?? ""}
            maxLength={4_000}
            placeholder="z. B. Bestuhlung, Grill, Feuerschale, Getränkekühlung oder benötigte Einweisung"
            onChange={(event) =>
              setField("specialRequirements", event.target.value)
            }
          />
        </label>
      </details>
    </>
  );
}

function ContactStep({
  form,
  setField,
}: {
  form: WizardState;
  setField: SetField;
}) {
  return (
    <>
      <section className={cardClassName}>
        <p className={sectionLabelClassName}>
          <FontAwesomeIcon icon={faUser} className="h-3 w-3" />
          Deine Kontaktdaten
        </p>
        <h2 className="mt-1 text-2xl font-black text-foreground">
          Wie können wir dich erreichen?
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label>
            <span className={labelClassName}>Vollständiger Name *</span>
            <input
              className={inputClassName}
              autoComplete="name"
              value={form.customerName}
              onChange={(event) => setField("customerName", event.target.value)}
            />
          </label>
          <label>
            <span className={labelClassName}>Organisation</span>
            <input
              className={inputClassName}
              autoComplete="organization"
              value={form.organization ?? ""}
              onChange={(event) => setField("organization", event.target.value)}
            />
          </label>
          <label>
            <span className={labelClassName}>E-Mail-Adresse *</span>
            <input
              className={inputClassName}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
            />
          </label>
          <label>
            <span className={labelClassName}>Telefonnummer</span>
            <input
              className={inputClassName}
              type="tel"
              autoComplete="tel"
              value={form.phone ?? ""}
              onChange={(event) => setField("phone", event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={cardClassName}>
        <p className={sectionLabelClassName}>
          <FontAwesomeIcon icon={faLocationDot} className="h-3 w-3" />
          Wohin soll später die Rechnung?
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-6">
          <label className="md:col-span-6">
            <span className={labelClassName}>Straße und Hausnummer *</span>
            <input
              className={inputClassName}
              autoComplete="street-address"
              value={form.billingAddressLine}
              onChange={(event) =>
                setField("billingAddressLine", event.target.value)
              }
            />
          </label>
          <label className="md:col-span-2">
            <span className={labelClassName}>Postleitzahl *</span>
            <input
              className={inputClassName}
              autoComplete="postal-code"
              value={form.billingZip}
              onChange={(event) => setField("billingZip", event.target.value)}
            />
          </label>
          <label className="md:col-span-4">
            <span className={labelClassName}>Ort *</span>
            <input
              className={inputClassName}
              autoComplete="address-level2"
              value={form.billingCity}
              onChange={(event) => setField("billingCity", event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={cardClassName}>
        <p className={`${sectionLabelClassName} mb-4`}>
          <FontAwesomeIcon icon={faShieldHalved} className="h-3 w-3" />
          Kurz noch bestätigen
        </p>
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-input accent-primary"
              checked={form.acceptedHouseRules}
              onChange={(event) =>
                setField("acceptedHouseRules", event.target.checked)
              }
            />
            <span className="text-sm leading-relaxed text-foreground">
              Ich habe zur Kenntnis genommen, dass Leitbild sowie Haus- und
              Raumordnung Voraussetzung für die Nutzung sind und die Räume
              besenrein im ursprünglichen Zustand zurückgegeben werden müssen.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-input accent-primary"
              checked={form.acceptedPrivacy}
              onChange={(event) =>
                setField("acceptedPrivacy", event.target.checked)
              }
            />
            <span className="text-sm leading-relaxed text-foreground">
              Ich stimme der Verarbeitung meiner Angaben zur Bearbeitung der
              Raumanfrage, Vertragserstellung und Rechnungsstellung zu.
            </span>
          </label>
          <label className="absolute -left-[10000px]" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website ?? ""}
              onChange={(event) => setField("website", event.target.value)}
            />
          </label>
        </div>
      </section>
    </>
  );
}

function ReviewStep({
  form,
  price,
}: {
  form: WizardState;
  price: ReturnType<typeof calculateVolkshausPrice>;
}) {
  const selectedEquipment = VOLKSHAUS_EQUIPMENT.filter(
    (item) => Number(form.equipment[item.id] ?? 0) > 0,
  );
  return (
    <section className={cardClassName}>
      <p className={sectionLabelClassName}>
        <FontAwesomeIcon icon={faClipboardCheck} className="h-3 w-3" />
        Alles auf einen Blick
      </p>
      <h2 className="mt-1 text-2xl font-black text-foreground">
        Passt das für dich?
      </h2>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <ReviewBlock title="Termin" icon={faCalendarDays}>
          <p>{formatFullDate(form.bookingDate)}</p>
          <p>
            {form.startTime}–{form.endTime} Uhr
          </p>
          {form.setupStartTime || form.teardownEndTime ? (
            <p className="text-muted-foreground">
              inklusive Blockierung {form.setupStartTime || form.startTime}–
              {form.teardownEndTime || form.endTime} Uhr
            </p>
          ) : null}
        </ReviewBlock>
        <ReviewBlock title="Räume" icon={faDoorOpen}>
          <p>{form.requestedRooms.map(getRoomLabel).join(", ")}</p>
          <p className="text-muted-foreground">
            {form.expectedAttendees} erwartete Personen
          </p>
        </ReviewBlock>
        <ReviewBlock title="Nutzung" icon={faTag}>
          <p className="font-semibold">{form.eventTitle}</p>
          <p>{form.eventDescription}</p>
          <p className="text-muted-foreground">
            {form.frequency === "recurring"
              ? `${form.recurringOccurrences} × pro Monat`
              : "einmalig"}
          </p>
        </ReviewBlock>
        <ReviewBlock title="Kontakt" icon={faUser}>
          <p>{form.customerName}</p>
          {form.organization ? <p>{form.organization}</p> : null}
          <p>{form.email}</p>
          <p>
            {form.billingAddressLine}, {form.billingZip} {form.billingCity}
          </p>
        </ReviewBlock>
        <ReviewBlock title="Ausstattung" icon={faScrewdriverWrench}>
          {selectedEquipment.length > 0 ? (
            <ul>
              {selectedEquipment.map((item) => (
                <li key={item.id}>
                  {Number(form.equipment[item.id] ?? 0)} × {item.label}
                </li>
              ))}
            </ul>
          ) : (
            <p>Keine zusätzliche Ausstattung</p>
          )}
        </ReviewBlock>
        <ReviewBlock title="Preis" icon={faReceipt}>
          <p className="text-xl font-black">{formatEuro(price.grossCents)}</p>
          <p className="text-muted-foreground">inklusive 19 % Umsatzsteuer</p>
        </ReviewBlock>
      </div>

      <div className="mt-6 flex gap-3 rounded-lg border border-info-border bg-info-soft p-4 text-sm text-info">
        <FontAwesomeIcon
          icon={faCircleInfo}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <p>
          Mit dem Absenden stellst du eine unverbindliche Anfrage. Erst die
          interne Freigabe, vorläufige Reservierung und beidseitige
          Unterzeichnung machen daraus eine bestätigte Buchung.
        </p>
      </div>
    </section>
  );
}

function ReviewBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconProp;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-muted/25 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-card text-primary shadow-sm">
          <FontAwesomeIcon icon={icon} className="h-3 w-3" />
        </span>
        {title}
      </h3>
      <div className="mt-3 space-y-1 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </div>
  );
}

function PriceSummary({
  price,
  form,
}: {
  price: ReturnType<typeof calculateVolkshausPrice>;
  form: WizardState;
}) {
  return (
    <aside className="rounded-lg bg-[linear-gradient(145deg,#a81757_0%,#7f2458_100%)] p-5 text-white shadow-[0_12px_34px_rgba(127,36,88,0.26)] ring-1 ring-white/15">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-white">
          <FontAwesomeIcon icon={faReceipt} className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm text-white/65">Deine Schätzung</p>
          <p className="font-black text-white">Ungefährer Gesamtpreis</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-4xl font-black tracking-tight text-white">
          {formatEuro(price.grossCents)}
        </p>
        <p className="mt-1 text-sm text-white/65">inklusive Umsatzsteuer</p>
      </div>

      <details className="group mt-5 border-t border-white/15 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white">
          So setzt sich der Preis zusammen
          <FontAwesomeIcon
            icon={faChevronRight}
            className="h-3 w-3 text-white/60 transition-transform group-open:rotate-90"
          />
        </summary>

        <div className="mt-3 divide-y divide-white/15">
          {price.lines.length > 0 ? (
            price.lines.map((line) => (
              <div
                key={line.code}
                className="flex items-start justify-between gap-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">{line.description}</p>
                  {line.quantity > 1 ? (
                    <p className="text-xs text-white/60">
                      {line.quantity} × {formatEuro(line.unitNetCents)}
                    </p>
                  ) : null}
                </div>
                <span className="whitespace-nowrap font-semibold text-white">
                  {formatEuro(line.totalNetCents)}
                </span>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm text-white/60">
              Wähle mindestens einen Raum.
            </p>
          )}
        </div>

        <dl className="space-y-2 border-t border-white/15 pt-3 text-sm">
          <div className="flex justify-between text-white/65">
            <dt>Netto</dt>
            <dd>{formatEuro(price.netCents)}</dd>
          </div>
          <div className="flex justify-between text-white/65">
            <dt>Umsatzsteuer 19 %</dt>
            <dd>{formatEuro(price.taxCents)}</dd>
          </div>
        </dl>
      </details>

      {price.requiresManualReview ? (
        <div className="mt-5 rounded-md bg-white/10 p-3 text-xs leading-relaxed text-white/80">
          <p className="flex items-center gap-2 font-bold">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
            Manuelle Preisprüfung
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {price.reviewReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-white/60">
        Unverbindlich für{" "}
        {form.requestedRooms.length > 0
          ? form.requestedRooms.map(getRoomLabel).join(", ")
          : "deine Auswahl"}
        . Den endgültigen Betrag klären wir mit dir vor dem Vertrag.
      </p>
    </aside>
  );
}
