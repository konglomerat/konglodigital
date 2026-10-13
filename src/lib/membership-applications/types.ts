// Mitgliedsanträge — Typen, Status und Anzeige, die Server und Inbox teilen.
// Ohne Server-Abhängigkeit, damit der Client sie importieren kann.
import {
  ACCESS_TARIFFS,
  ANNUAL_FEE_LABELS,
  TRIAL_FEE_EURO,
  accessTariffById,
  type RegistrationInput,
} from "@/lib/campai-registration";

export type ApplicationStatus =
  | "pending"
  | "inquiry"
  | "invoice_draft"
  | "welcomed"
  | "completed"
  | "rejected";

/** Der Antrag ohne Unterschriften — so steht er in `data` und `submitted_data`. */
export type ApplicationData = Omit<RegistrationInput, "signature" | "sepaSignature">;

export type ApplicationSignatures = {
  signature: string;
  sepaSignature?: string;
};

/** Was die Schritte beim Annehmen in Campai angelegt haben. */
export type CampaiProgress = {
  contactId?: string;
  memberNumber?: string;
  debtorAccount?: number;
  /** Beitragsfelder und Telefonnummern gesetzt. */
  detailsSetAt?: string;
  documentId?: string;
  /** Plan-ID → Vertrags-ID, damit ein erneuter Klick keinen Vertrag doppelt anlegt. */
  contracts?: Record<string, string>;
  collectedAt?: string;
  /** Beim Annehmen war noch nichts fällig (Eintritt in der Zukunft). */
  noInvoiceDue?: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  welcomeSentAt?: string;
  completionSentAt?: string;
};

/** Was der Vorstand nach dem Annehmen abhakt — Reihenfolge siehe CHECKLIST. */
export const CHECKLIST_STEPS = [
  "roseguarden",
  "payment",
  "mailingList",
  "card",
  "cardHandedOut",
] as const;

export type ChecklistStep = (typeof CHECKLIST_STEPS)[number];

export type ChecklistEntry = {
  at: string;
  /** Name der Person; `null`, wenn Campai die Zahlung gemeldet hat. */
  by: string | null;
  cardNumber?: string;
};

export type Checklist = Partial<Record<ChecklistStep, ChecklistEntry>>;

export type HistoryType =
  | "submitted"
  | "edited"
  | "inquiry"
  | "accepted"
  | "invoice_released"
  | "completed"
  | "rejected";

export type HistoryEntry = {
  at: string;
  /** Name der Person aus dem Vorstand; `null` = Antragsteller:in oder System. */
  by: string | null;
  type: HistoryType;
  text?: string;
};

export type MembershipApplication = {
  id: string;
  number: string;
  status: ApplicationStatus;
  email: string;
  firstName: string;
  lastName: string;
  submittedData: ApplicationData;
  data: ApplicationData;
  /** Nur in der Detailansicht; die Liste lässt sie weg. */
  signatures: ApplicationSignatures | null;
  campai: CampaiProgress;
  checklist: Checklist;
  rejectionReason: string | null;
  history: HistoryEntry[];
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Die Rechnung, wie die Inbox sie zum Prüfen zeigt. */
export type ApplicationInvoice = {
  id: string;
  number: string | null;
  draft: boolean;
  amountCents: number;
  leftToPayCents: number;
  paymentStatus: "unpaid" | "partial" | "paid";
  dueDate: string | null;
  paidAt: string | null;
  fileName: string;
  reference: string | null;
  positions: { description: string; amountCents: number }[];
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Neu",
  inquiry: "Rückfrage",
  invoice_draft: "Aufnahme",
  welcomed: "Aufnahme",
  completed: "Mitglied",
  rejected: "Abgelehnt",
};

export const STATUS_TONES = {
  pending: "neu",
  inquiry: "wartet",
  invoice_draft: "offen",
  welcomed: "offen",
  completed: "gebucht",
  rejected: "neutral",
} as const satisfies Record<ApplicationStatus, string>;

export const APPLICATION_TABS = [
  { value: "open", label: "Offen", statuses: ["pending", "inquiry"] },
  { value: "onboarding", label: "Aufnahme", statuses: ["invoice_draft", "welcomed"] },
  { value: "members", label: "Mitglied", statuses: ["completed"] },
  { value: "rejected", label: "Abgelehnt", statuses: ["rejected"] },
  {
    value: "all",
    label: "Alle",
    statuses: [
      "pending",
      "inquiry",
      "invoice_draft",
      "welcomed",
      "completed",
      "rejected",
    ],
  },
] as const satisfies readonly {
  value: string;
  label: string;
  statuses: readonly ApplicationStatus[];
}[];

export type ApplicationTab = (typeof APPLICATION_TABS)[number]["value"];

/** Bearbeiten, Rückfrage, Annehmen und Ablehnen gehen nur vor dem Annehmen. */
export const isUndecided = (status: ApplicationStatus) =>
  status === "pending" || status === "inquiry";

export const isOnboarding = (status: ApplicationStatus) =>
  status === "invoice_draft" || status === "welcomed";

export const tabOf = (status: ApplicationStatus): ApplicationTab =>
  APPLICATION_TABS.find(
    (tab) => tab.value !== "all" && (tab.statuses as readonly string[]).includes(status),
  )?.value ?? "all";

// --- Aufnahme ---------------------------------------------------------------

export type OnboardingItem = {
  key: "welcome" | ChecklistStep;
  label: string;
  /** Kurz für „Offen: …" in der Liste. */
  short: string;
  /** Steht unter dem Titel, solange der Punkt offen ist. */
  hint?: string;
  done: boolean;
};

type ChecklistDefinition = {
  key: ChecklistStep;
  label: string;
  short: string;
  hint?: (data: ApplicationData) => string;
  /** Ohne Bedingung gilt der Punkt für jeden Antrag. */
  appliesTo?: (data: ApplicationData) => boolean;
};

const hasAccessCard = (data: ApplicationData) =>
  Boolean(accessTariffById(data.accessTariff)?.planId);

/**
 * Die Punkte zum Abhaken, in ihrer Reihenfolge. Ein neuer Punkt ist ein
 * Eintrag hier plus sein Schlüssel in CHECKLIST_STEPS — die Datenbank braucht
 * nichts, `checklist` ist JSON. Sonderfälle stehen im Code: die Zahlung hakt
 * Campai ab (workflow.ts), „Zugangskarte erstellt" fragt die Kartennummer ab.
 */
const CHECKLIST: ChecklistDefinition[] = [
  {
    key: "roseguarden",
    label: "Roseguarden-Konto angelegt",
    short: "Roseguarden",
    hint: (data) => `In Roseguarden nach ${data.email} suchen.`,
  },
  { key: "payment", label: "Überweisung eingegangen", short: "Zahlung" },
  { key: "mailingList", label: "Mailingliste Verein", short: "Mailingliste" },
  {
    key: "card",
    label: "Zugangskarte erstellt",
    short: "Karte erstellen",
    hint: () => "Nummer eintragen, dann im Schließsystem freischalten.",
    appliesTo: hasAccessCard,
  },
  {
    key: "cardHandedOut",
    label: "Zugangskarte ausgegeben",
    short: "Karte ausgeben",
    appliesTo: hasAccessCard,
  },
];

/**
 * Die Punkte der Aufnahme. Vorneweg die Willkommensmail — die erledigt die
 * Freigabe der Rechnung, nicht ein Häkchen.
 */
export const onboardingItems = (
  application: Pick<MembershipApplication, "data" | "campai" | "checklist">,
): OnboardingItem[] => [
  {
    key: "welcome",
    label: "Willkommensmail mit Rechnung verschickt",
    short: "Rechnung",
    done: Boolean(application.campai.welcomeSentAt),
  },
  ...CHECKLIST.filter((step) => step.appliesTo?.(application.data) ?? true).map((step) => ({
    key: step.key,
    label: step.label,
    short: step.short,
    hint: step.hint?.(application.data),
    done: Boolean(application.checklist[step.key]),
  })),
];

/** „VS" für „Vincent Schmidt". */
export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

// --- Anzeige ----------------------------------------------------------------

export const formatEuro = (euro: number) =>
  euro.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export const formatEuroCents = (cents: number) => formatEuro(cents / 100);

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Europe/Berlin",
      });
};

/** „Regulär" bzw. „Schnuppertarif" und der Betrag im ersten Jahr. */
export const describeFee = (data: ApplicationData) => {
  if (data.trialRate) {
    return { label: "Schnuppertarif", euro: TRIAL_FEE_EURO };
  }
  if (data.annualFee === null) return { label: "—", euro: null };
  return { label: ANNUAL_FEE_LABELS[data.annualFee], euro: data.annualFee };
};

export const describeAccess = (data: ApplicationData) =>
  accessTariffById(data.accessTariff)?.name ?? "—";

export const describePayment = (data: ApplicationData) =>
  data.paymentMethod === "sepaDirectDebit"
    ? "SEPA-Lastschrift"
    : data.paymentMethod === "sepaCreditTransfer"
      ? "Überweisung"
      : "—";

export const describeAddress = (data: ApplicationData) =>
  `${data.street}, ${data.zip} ${data.city}`;

// --- Korrekturen ------------------------------------------------------------

const FIELD_LABELS: Record<keyof ApplicationData, string> = {
  firstName: "Vorname",
  lastName: "Nachname",
  email: "E-Mail",
  phone: "Telefon",
  mobilePhone: "Mobil",
  street: "Straße",
  zip: "PLZ",
  city: "Ort",
  entryAt: "Eintritt",
  annualFee: "Jahresbeitrag",
  trialRate: "Schnuppertarif",
  accessTariff: "Zugangskarte",
  paymentMethod: "Zahlungsmittel",
  accountHolder: "Kontoinhaber:in",
  iban: "IBAN",
  statutesAccepted: "Satzung gelesen",
  feeRulesAccepted: "Beitragsordnung gelesen",
};

const formatValue = (field: keyof ApplicationData, data: ApplicationData) => {
  const value = data[field];
  if (field === "annualFee") {
    return data.annualFee === null
      ? "—"
      : `${ANNUAL_FEE_LABELS[data.annualFee]} · ${formatEuro(data.annualFee)}`;
  }
  if (field === "accessTariff") {
    return ACCESS_TARIFFS.find((tariff) => tariff.id === value)?.name ?? "—";
  }
  if (field === "paymentMethod") return describePayment(data);
  if (field === "entryAt") return formatDate(data.entryAt);
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  return value === null || value === "" ? "—" : String(value);
};

export type FieldChange = {
  field: keyof ApplicationData;
  label: string;
  from: string;
  to: string;
};

/** Was der Vorstand gegenüber der Einreichung geändert hat. */
export const changedFields = (
  before: ApplicationData,
  after: ApplicationData,
): FieldChange[] =>
  (Object.keys(FIELD_LABELS) as (keyof ApplicationData)[])
    .filter((field) => before[field] !== after[field])
    .map((field) => ({
      field,
      label: FIELD_LABELS[field],
      from: formatValue(field, before),
      to: formatValue(field, after),
    }));
