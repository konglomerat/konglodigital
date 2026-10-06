// Mitgliedsantrag — was /registration abfragt, wie es geprüft wird und wie
// es in Campais Antragsformular übersetzt wird.
//
// Das Formular in Campai („Mitgliedsantrag (konglodigital)") ist ein reiner
// Datenvertrag ohne eigene Oberfläche; angelegt und gepflegt wird es mit
// scripts/campai-registration-form.mjs. Die Feld-IDs unten müssen zu diesem
// Skript passen.
//
// Die Datei läuft auf beiden Seiten: der Client prüft damit jeden Schritt,
// der Server prüft dieselben Regeln noch einmal und baut die Einreichung.

/** Das Antragsformular in Campai. */
export const REGISTRATION_FORM_ID = "6aba5efa17a4b750dbe9f7f2";

/** Der Jahresbeitrag ist Pflicht — jeder Antrag legt diesen Vertrag an. */
export const ANNUAL_PLAN_ID = "685a87790afb4b4a84815a53";

/**
 * SEPA-Lastschrift. In Campai ist sie (Stand 2026-10-03) nicht eingerichtet —
 * keine Gläubiger-ID, `paymentMethods.sepaDirectDebit` in den
 * Finanzeinstellungen ist leer. Solange das so ist, bietet der Antrag nur die
 * Überweisung an. Zum Einschalten: Lastschrift in Campai einrichten,
 * `sepaDirectDebit` im Formular-Skript erlauben, Gläubiger-ID unten eintragen.
 */
export const SEPA_DIRECT_DEBIT_ENABLED = false;
export const SEPA_CREDITOR_ID = "";

export const ANNUAL_FEE_OPTIONS = [120, 150, 180] as const;
export type AnnualFee = (typeof ANNUAL_FEE_OPTIONS)[number];

export const ANNUAL_FEE_LABELS: Record<AnnualFee, string> = {
  120: "Ermäßigt",
  150: "Regulär",
  180: "Solidarisch",
};

export const TRIAL_FEE_EURO = 90;

/** Ohne Wahl im Antrag gilt: Aktivmitglied. */
const MEMBERSHIP_TYPE = "Aktivmitglied";

export type AccessTariff = "none" | "small" | "large" | "punchCard";

/** Zugangskarte — optional ein zweiter Vertrag neben dem Jahresbeitrag. */
export const ACCESS_TARIFFS: {
  id: AccessTariff;
  name: string;
  lead: string;
  /** Monatlich (Abo), einmalig (10er-Karte) oder gar nichts. */
  kind: "none" | "abo" | "once";
  euro: number;
  planId: string | null;
}[] = [
  {
    id: "none",
    name: "Keine Zugangskarte",
    lead: "Zutritt z. B. zur offenen Werkstatt",
    kind: "none",
    euro: 0,
    planId: null,
  },
  {
    id: "small",
    name: "Abo Klein",
    lead: "15 Tage pro Quartal",
    kind: "abo",
    euro: 15,
    planId: "6ab6f8b7744be89ef4ced0d3",
  },
  {
    id: "large",
    name: "Abo Groß",
    lead: "24/7, alle Bereiche",
    kind: "abo",
    euro: 30,
    planId: "6ab6fadb71bd5601926b8af2",
  },
  {
    id: "punchCard",
    name: "10er-Karte",
    lead: "10 Tage, 12 Monate gültig",
    kind: "once",
    euro: 50,
    planId: "685a90649f62e6eb504b1de4",
  },
];

/** `null`, solange keine Karte gewählt ist. */
export const accessTariffById = (id: AccessTariff | "") =>
  ACCESS_TARIFFS.find((tariff) => tariff.id === id) ?? null;

export const DOCUMENT_LINKS = {
  statutes:
    "https://konglomerat.org/_Resources/Persistent/f/f/3/8/ff3887bd0ee99cf3e88de994fad1aff7180c7b4e/181213_Satzung%20Konglomerat%20e.V..pdf",
  feeRules:
    "https://konglomerat.org/_Resources/Persistent/2/7/6/0/276094e20517ea91f16dff9bd4d83cdc52f8ac53/241209_Beitragsordnung.pdf",
  privacyPolicy: "https://konglomerat.org/datenschutz",
} as const;

export type PaymentMethod = "sepaDirectDebit" | "sepaCreditTransfer";

export type RegistrationInput = {
  // 2 · Beitrag & Zugangskarte — nichts ist vorausgewählt.
  annualFee: AnnualFee | null;
  trialRate: boolean;
  accessTariff: AccessTariff | "";
  /** YYYY-MM-DD */
  entryAt: string;
  // 1 · Persönliche Daten
  firstName: string;
  lastName: string;
  /** Festnetz; optional wie Mobil. */
  phone: string;
  mobilePhone: string;
  email: string;
  street: string;
  zip: string;
  city: string;
  // 3 · Zahlung
  paymentMethod: PaymentMethod | "";
  accountHolder: string;
  iban: string;
  // 4 · Satzung & Beitragsordnung
  statutesAccepted: boolean;
  feeRulesAccepted: boolean;
  // 5 · Unterschriften — PNG als Data-URL vom Unterschriftenfeld.
  signature: string | null;
  sepaSignature: string | null;
};

export type RegistrationField = keyof RegistrationInput;
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export const REGISTRATION_STEPS = [
  "Persönliche Daten",
  "Beitrag & Karte",
  "Zahlung",
  "Satzung & Beitragsordnung",
  "Unterschriften",
] as const;

export type RegistrationStep = 1 | 2 | 3 | 4 | 5;

const STEP_FIELDS: Record<RegistrationStep, RegistrationField[]> = {
  1: [
    "firstName",
    "lastName",
    "phone",
    "mobilePhone",
    "email",
    "street",
    "zip",
    "city",
  ],
  2: ["annualFee", "trialRate", "accessTariff", "entryAt"],
  3: ["paymentMethod", "accountHolder", "iban"],
  4: ["statutesAccepted", "feeRulesAccepted"],
  5: ["signature", "sepaSignature"],
};

const today = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};

export const emptyRegistration = (): RegistrationInput => ({
  annualFee: null,
  trialRate: false,
  accessTariff: "",
  entryAt: today(),
  firstName: "",
  lastName: "",
  phone: "",
  mobilePhone: "",
  email: "",
  street: "",
  zip: "",
  city: "",
  paymentMethod: "",
  accountHolder: "",
  iban: "",
  statutesAccepted: false,
  feeRulesAccepted: false,
  signature: null,
  sepaSignature: null,
});

// --- Rechnen ----------------------------------------------------------------

/**
 * Eckdaten für den Zahlplan: Beitrittsjahr und -monat, Quartale bis
 * Jahresende und der Beitrag im Beitrittsjahr. `firstYearFee` ist `null`,
 * solange weder Beitrag noch Schnuppertarif gewählt sind.
 */
export const registrationCosts = (input: RegistrationInput) => {
  const [year, month] = input.entryAt.split("-").map(Number);
  const monthIndex = Number.isFinite(month) ? month - 1 : 0;
  const quarter = Math.floor(monthIndex / 3);

  return {
    year,
    /** Beitrittsmonat, 0 = Januar. */
    monthIndex,
    quarterLabel: `Q${quarter + 1}`,
    quartersLeft: 4 - quarter,
    firstYearFee: input.trialRate ? TRIAL_FEE_EURO : input.annualFee,
    tariff: accessTariffById(input.accessTariff),
  };
};

// --- Prüfen -----------------------------------------------------------------

/** Meldung für leere Pflichtfelder — sie zählen als „fehlt", ohne Rot. */
export const MISSING = "Bitte ausfüllen.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Telefonnummer in E.164, wie Campai sie speichert. Nationale Nummern ohne
 * Vorwahl gelten als deutsch. `null`, wenn keine brauchbare Nummer übrig
 * bleibt.
 */
export const normalizePhone = (raw: string): string | null => {
  let digits = raw.trim().replace(/[\s()./-]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  else if (digits.startsWith("0")) digits = `+49${digits.slice(1)}`;
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
};

export const normalizeIban = (raw: string) => raw.replace(/\s/g, "").toUpperCase();

/** Format und Prüfsumme (Modulo 97). */
export const isValidIban = (raw: string) => {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (char) =>
    String(char.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
};

const isPngDataUrl = (value: string | null) =>
  typeof value === "string" && value.startsWith("data:image/png;base64,");

export const usesDirectDebit = (input: RegistrationInput) =>
  SEPA_DIRECT_DEBIT_ENABLED && input.paymentMethod === "sepaDirectDebit";

/** Fehlermeldungen je Feld; leer heißt: der Antrag kann raus. */
export const validateRegistration = (
  input: RegistrationInput,
): RegistrationErrors => {
  const errors: RegistrationErrors = {};
  const required = (field: RegistrationField, value: string, max = 100) => {
    if (!value.trim()) errors[field] = MISSING;
    else if (value.trim().length > max) errors[field] = "Das ist zu lang.";
  };

  // 2 · Beitrag & Zugangskarte
  if (!ANNUAL_FEE_OPTIONS.includes(input.annualFee as AnnualFee)) {
    errors.annualFee = "Bitte einen Beitrag wählen.";
  }
  if (!ACCESS_TARIFFS.some((tariff) => tariff.id === input.accessTariff)) {
    errors.accessTariff = "Bitte eine Möglichkeit wählen.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryAt)) {
    errors.entryAt = "Bitte ein Datum wählen.";
  }

  // 1 · Persönliche Daten
  required("firstName", input.firstName);
  required("lastName", input.lastName);
  // Mobil und Festnetz sind optional; was drinsteht, muss eine Nummer sein.
  for (const field of ["mobilePhone", "phone"] as const) {
    if (input[field].trim() && !normalizePhone(input[field])) {
      errors[field] = "Bitte eine Telefonnummer mit Vorwahl angeben.";
    }
  }
  if (!input.email.trim()) errors.email = MISSING;
  else if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = "Das sieht nicht nach einer E-Mail-Adresse aus.";
  }
  // Campai erlaubt je Adresszeile 45 Zeichen; PLZ und Ort teilen sich eine.
  required("street", input.street, 45);
  required("zip", input.zip, 10);
  // Campai prüft die PLZ nach Land und lehnt sonst den ganzen Antrag ab —
  // die Anschrift ist immer deutsch, also genau fünf Ziffern.
  if (!errors.zip && !/^\d{5}$/.test(input.zip.trim())) {
    errors.zip = "Bitte eine fünfstellige Postleitzahl angeben.";
  }
  required("city", input.city, 44 - input.zip.trim().length);

  // 3 · Zahlung
  if (usesDirectDebit(input)) {
    required("accountHolder", input.accountHolder);
    if (!input.iban.trim()) errors.iban = MISSING;
    else if (!isValidIban(input.iban)) {
      errors.iban = "Die IBAN scheint unvollständig.";
    }
  } else if (input.paymentMethod !== "sepaCreditTransfer") {
    errors.paymentMethod = MISSING;
  }

  // 4 · Satzung & Beitragsordnung
  if (!input.statutesAccepted) errors.statutesAccepted = MISSING;
  if (!input.feeRulesAccepted) errors.feeRulesAccepted = MISSING;

  // 5 · Unterschriften
  if (!isPngDataUrl(input.signature)) errors.signature = MISSING;
  if (usesDirectDebit(input) && !isPngDataUrl(input.sepaSignature)) {
    errors.sepaSignature = MISSING;
  }

  return errors;
};

/** Die Fehler eines Schritts. */
export const stepErrors = (
  errors: RegistrationErrors,
  step: RegistrationStep,
): RegistrationErrors =>
  Object.fromEntries(
    STEP_FIELDS[step]
      .filter((field) => errors[field])
      .map((field) => [field, errors[field]]),
  );

/** Der erste Schritt, in dem etwas fehlt — für Fehler vom Server. */
export const firstStepWithErrors = (
  errors: RegistrationErrors,
): RegistrationStep | null =>
  ([1, 2, 3, 4, 5] as const).find(
    (step) => Object.keys(stepErrors(errors, step)).length > 0,
  ) ?? null;

// --- Einreichung ------------------------------------------------------------

/** Eine hochgeladene Unterschrift, wie Campai sie im Antrag ablegt. */
export type UploadedFile = {
  resource: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
};

export type UploadedSignatures = {
  signature: UploadedFile;
  sepaSignature?: UploadedFile;
};

/** Die Verträge des Antrags: immer der Jahresbeitrag, dazu die Zugangskarte. */
export const contractPlanIds = (input: RegistrationInput): string[] => {
  const access = accessTariffById(input.accessTariff);
  return [ANNUAL_PLAN_ID, ...(access?.planId ? [access.planId] : [])];
};

/**
 * Die Werte in Campais Form, geschlüsselt nach den Feld-IDs des Formulars.
 * Leere optionale Felder fehlen. Setzt geprüfte Eingaben voraus.
 */
export const buildSubmissionData = (
  input: RegistrationInput,
  signatures: UploadedSignatures,
): Record<string, unknown> => {
  const trim = (value: string) => value.trim();
  const phone = normalizePhone(input.phone);
  const mobilePhone = normalizePhone(input.mobilePhone);
  const directDebit = usesDirectDebit(input);

  return {
    firstName: trim(input.firstName),
    lastName: trim(input.lastName),
    entryAt: `${input.entryAt}T00:00:00.000Z`,
    membershipType: MEMBERSHIP_TYPE,
    address: {
      country: "DE",
      zip: trim(input.zip),
      city: trim(input.city),
      addressLine: trim(input.street),
    },
    email: trim(input.email).toLowerCase(),
    ...(phone ? { phone } : {}),
    ...(mobilePhone ? { mobilePhone } : {}),
    annualFee: input.annualFee,
    trialRate: input.trialRate,
    // Wiederholbare Gruppe: ein Eintrag je Vertrag.
    contracts: contractPlanIds(input).map((plan) => ({ plan })),
    ...(directDebit
      ? {
          payerName: trim(input.accountHolder),
          paymentMethod: {
            type: "sepaDirectDebit",
            sepaDirectDebit: { iban: normalizeIban(input.iban), bic: null },
          },
        }
      : { paymentMethod: { type: "sepaCreditTransfer" } }),
    statutesRead: input.statutesAccepted,
    feeRulesRead: input.feeRulesAccepted,
    signature: signatures.signature,
    ...(signatures.sepaSignature ? { sepaSignature: signatures.sepaSignature } : {}),
  };
};
