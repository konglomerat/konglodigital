// Ehrenamtsbonus — geteilte Sprache zwischen Mitglieder-Antrag und
// Vorstands-Bearbeitung. Statuswerte, Optionen und vor allem die
// Entscheidungsmatrix stehen genau einmal hier: Vorschautext im Formular und
// die Systemaktionen, die der Vorstand vor der Zustimmung sieht, kommen aus
// derselben Funktion. Sonst zeigen die beiden Seiten irgendwann Verschiedenes.
//
// Es wird nicht abgestimmt: ein Vorstandsmitglied entscheidet, festgehalten
// wird in `decidedBy`, wer es war.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BadgeTone } from "@/components/knglmrt/Badge";
import { isMissingRelationError } from "@/lib/supabase-errors";
import { WERKBEREICHE } from "@/lib/werkbereiche";

export const EHRENAMTSBONUS_TABLE = "ehrenamtsbonus_requests";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const EHRENAMTSBONUS_STATUSES = [
  "in_review",
  "approved",
  "rejected",
] as const;

export type EhrenamtsbonusStatus = (typeof EHRENAMTSBONUS_STATUSES)[number];

/** Status, über die der Vorstand noch entscheiden muss. */
export const isOpenStatus = (status: EhrenamtsbonusStatus) =>
  status === "in_review";

/**
 * Was auf der Marke steht. „Läuft ab" und „Abgelaufen" sind keine gespeicherten
 * Status, sondern ergeben sich aus der Befristung eines angenommenen Antrags —
 * eine Regel des Features: jeder Bonus läuft automatisch aus.
 */
export type EhrenamtsbonusDisplayStatus =
  | EhrenamtsbonusStatus
  | "expiring"
  | "expired";

export const EHRENAMTSBONUS_STATUS_LABELS: Record<
  EhrenamtsbonusDisplayStatus,
  string
> = {
  in_review: "In Prüfung",
  approved: "Angenommen",
  rejected: "Abgelehnt",
  expiring: "Läuft ab",
  expired: "Abgelaufen",
};

// Die Tonwerte des DS kennen kein Grün/Rot — angenommen läuft auf der blauen
// Tint-Stufe („gebucht"), abgelehnt auf der pinken („offen").
export const EHRENAMTSBONUS_STATUS_TONES: Record<
  EhrenamtsbonusDisplayStatus,
  BadgeTone
> = {
  in_review: "neu",
  approved: "gebucht",
  rejected: "offen",
  expiring: "wartet",
  expired: "neutral",
};

/** Ab wann ein laufender Bonus als „läuft bald ab" gilt. */
export const EXPIRING_SOON_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export const resolveDisplayStatus = (
  request: Pick<EhrenamtsbonusRequest, "status" | "validUntil">,
  now = new Date(),
): EhrenamtsbonusDisplayStatus => {
  if (request.status !== "approved") {
    return request.status;
  }

  const until = new Date(`${request.validUntil}T23:59:59`);
  if (Number.isNaN(until.getTime())) {
    return "approved";
  }
  if (until.getTime() < now.getTime()) {
    return "expired";
  }
  if (until.getTime() - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS) {
    return "expiring";
  }
  return "approved";
};

// ---------------------------------------------------------------------------
// Zugang und beantragbare Optionen
// ---------------------------------------------------------------------------

/** Der Zugang, den ein Mitglied heute hat — die Zeilen der Matrix. */
export const ACCESS_LEVELS = [
  "keine_karte",
  "punktekarte",
  "abo_klein",
  "abo_gross",
] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

// Der Tarif kommt aus Campai; ob dazu eine Karte ausgestellt ist, weiß die
// App nicht — deshalb heißt die leere Stufe „Kein Tarif" und nicht
// „Keine Karte". Der Schlüssel bleibt, damit die Matrix lesbar bleibt.
export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  keine_karte: "Kein Tarif",
  punktekarte: "Punktekarte",
  abo_klein: "Abo klein (15 €)",
  abo_gross: "Abo groß (30 €)",
};

/** Die beantragbaren Optionen — die Spalten der Matrix. */
export const BONUS_OPTIONS = ["tage_10", "unbegrenzt", "anerkennung"] as const;

export type BonusOption = (typeof BONUS_OPTIONS)[number];

export const BONUS_OPTION_LABELS: Record<BonusOption, string> = {
  tage_10: "10 Tage pro Quartal",
  unbegrenzt: "Uneingeschränkter Zugang",
  anerkennung: "Nur Anerkennung",
};

export const BONUS_OPTION_HINTS: Record<BonusOption, string> = {
  tage_10: "Zehn zusätzliche Zugangstage im gewählten Quartal.",
  unbegrenzt: "Zugang rund um die Uhr für die Dauer des Bonus.",
  anerkennung:
    "Tarif und Zugang bleiben unverändert — dein Einsatz wird im Profil sichtbar.",
};

/** Optionen, die am Zugang des Mitglieds etwas ändern. */
export type ChangingBonusOption = Exclude<BonusOption, "anerkennung">;

// ---------------------------------------------------------------------------
// Entscheidungsmatrix
// ---------------------------------------------------------------------------

/** Das System, das die Aktion ausführt — im Vorstandsbereich als Tag-Marke. */
export type SystemTarget = "roseguarden" | "campai";

export const SYSTEM_TARGET_LABELS: Record<SystemTarget, string> = {
  roseguarden: "Roseguarden",
  campai: "Campai",
};

export type SystemAction = {
  target: SystemTarget;
  label: string;
};

export type BonusOutcome = {
  /** Ein Satz für die Vorschaubox im Formular. */
  summary: string;
  /** Die aufgelösten Systemaktionen für den Vorstandsbereich. */
  actions: SystemAction[];
  /** Beitrag, der dem Verein im Bonuszeitraum entgeht. */
  forgoneCents: number;
};

// Die Tarife, aus denen sich der entgangene Beitrag rechnet: Punktekarte 5 €
// je Zugang, Abo klein 15 €/Monat, Abo groß 30 €/Monat. Uneingeschränkter
// Zugang ist das, was das große Abo kostet. Ändern sich die Tarife, ändert
// sich hier eine Zahl — nicht acht Stellen in der Matrix.
const ZUGANG_CENTS = 500;
const ABO_KLEIN_MONAT_CENTS = 1500;
const ABO_GROSS_MONAT_CENTS = 3000;
const MONATE_PRO_QUARTAL = 3;

const ZEHN_ZUGAENGE_CENTS = 10 * ZUGANG_CENTS;
const QUARTAL_ABO_KLEIN_CENTS = MONATE_PRO_QUARTAL * ABO_KLEIN_MONAT_CENTS;
const QUARTAL_ABO_GROSS_CENTS = MONATE_PRO_QUARTAL * ABO_GROSS_MONAT_CENTS;

const roseguarden = (label: string): SystemAction => ({
  target: "roseguarden",
  label,
});

const campai = (label: string): SystemAction => ({ target: "campai", label });

// Ein bestehendes Abo wird für den Bonuszeitraum pausiert und durch die
// beantragte Option ersetzt — dieselbe Regel für beide Abos und beide
// Optionen. Entgangen ist dem Verein damit genau der Beitrag des Quartals,
// unabhängig davon, was das Mitglied stattdessen bekommt.
const ABO_PAUSE: Partial<
  Record<AccessLevel, { action: SystemAction; quartalCents: number }>
> = {
  abo_klein: {
    action: campai("Abo klein pausieren"),
    quartalCents: QUARTAL_ABO_KLEIN_CENTS,
  },
  abo_gross: {
    action: campai("Abo groß pausieren"),
    quartalCents: QUARTAL_ABO_GROSS_CENTS,
  },
};

/** Was das Mitglied bekommt — hängt nur an der Option und an der Karte. */
const grantActions = (
  access: AccessLevel,
  option: ChangingBonusOption,
): SystemAction[] => {
  if (option === "unbegrenzt") {
    // Wer schon 24/7 hat, bekommt keinen neuen Zugang — nur die Pause.
    if (access === "abo_gross") return [];
    return access === "keine_karte"
      ? [roseguarden("Zugangskarte mit 24/7-Zugang ausstellen")]
      : [roseguarden("Zugang auf 24/7 heben")];
  }

  return access === "keine_karte"
    ? [
        roseguarden("Zugangskarte ausstellen"),
        roseguarden("10 Zugänge gutschreiben"),
      ]
    : [roseguarden("10 Zugänge gutschreiben")];
};

/** Ein Satz für die Vorschaubox im Formular. */
const summaryFor = (
  access: AccessLevel,
  option: ChangingBonusOption,
  hasAbo: boolean,
): string => {
  if (hasAbo) {
    return option === "unbegrenzt"
      ? access === "abo_gross"
        ? "Dein Abo pausiert im Bonuszeitraum, dein 24/7-Zugang bleibt."
        : "Dein Abo pausiert im Bonuszeitraum — stattdessen hast du uneingeschränkten Zugang."
      : "Dein Abo pausiert im Bonuszeitraum — stattdessen bekommst du 10 Zugänge.";
  }

  if (option === "unbegrenzt") {
    return access === "keine_karte"
      ? "Du bekommst eine Zugangskarte mit uneingeschränktem Zugang für den Bonuszeitraum."
      : "Deine Karte wird für den Bonuszeitraum auf 24/7-Zugang gehoben.";
  }

  return access === "keine_karte"
    ? "Du bekommst eine Zugangskarte mit 10 Zugängen für den Bonuszeitraum."
    : "Dir werden 10 Zugänge für den Bonuszeitraum gutgeschrieben.";
};

/**
 * Die Entscheidungsmatrix des Features. Zeile = heutiger Zugang,
 * Spalte = beantragte Option. Besteht ein Abo, wird es pausiert und durch die
 * Option ersetzt; ohne Abo entgeht dem Verein der Wert dessen, was er gewährt.
 *
 * „Nur Anerkennung" fällt aus der Matrix heraus: Tarif und Zugang bleiben, wie
 * sie sind, kein System wird angefasst, dem Verein entgeht nichts. Der Antrag
 * läuft trotzdem durch die Prüfung — er ist die Grundlage für das Abzeichen
 * im Profil.
 */
export const resolveOutcome = (
  access: AccessLevel,
  option: BonusOption,
): BonusOutcome => {
  if (option === "anerkennung") {
    return {
      summary:
        "An deiner Mitgliedschaft ändert sich nichts — dein Einsatz wird im Profil sichtbar.",
      actions: [],
      forgoneCents: 0,
    };
  }

  const pause = ABO_PAUSE[access];
  const grant = grantActions(access, option);

  return {
    summary: summaryFor(access, option, Boolean(pause)),
    actions: pause ? [pause.action, ...grant] : grant,
    forgoneCents: pause
      ? pause.quartalCents
      : option === "unbegrenzt"
        ? QUARTAL_ABO_GROSS_CENTS
        : ZEHN_ZUGAENGE_CENTS,
  };
};

export const formatEuro = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

// ---------------------------------------------------------------------------
// Quartale — der Bonus wirkt immer ab Quartalsbeginn, nie rückwirkend
// ---------------------------------------------------------------------------

export type QuarterStart = {
  /** ISO-Datum des Quartalsersten — der Wert des Selects. */
  value: string;
  label: string;
  year: number;
  quarter: number;
};

const pad = (value: number) => String(value).padStart(2, "0");

const quarterStartDate = (year: number, quarter: number) =>
  `${year}-${pad((quarter - 1) * 3 + 1)}-01`;

/** Letzter Tag des Quartals — die Befristung eines Bonus. */
export const quarterEndDate = (year: number, quarter: number) => {
  const endMonth = quarter * 3;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return `${year}-${pad(endMonth)}-${pad(lastDay)}`;
};

const quarterOf = (date: Date) => Math.floor(date.getMonth() / 3) + 1;

/**
 * Die nächsten wählbaren Quartalsanfänge. Das laufende Quartal fehlt bewusst:
 * ein Bonus wirkt nie rückwirkend.
 */
export const listSelectableQuarterStarts = (
  count = 4,
  now = new Date(),
): QuarterStart[] => {
  const baseQuarter = quarterOf(now);
  return Array.from({ length: count }, (_, index) => {
    const offset = baseQuarter + index;
    const year = now.getFullYear() + Math.floor(offset / 4);
    const quarter = (offset % 4) + 1;
    const start = quarterStartDate(year, quarter);
    return {
      value: start,
      label: `Q${quarter}/${year} — ab ${pad((quarter - 1) * 3 + 1)}/${year}`,
      year,
      quarter,
    };
  });
};

/** Das Quartal, in dem ein ISO-Datum liegt. Für Labels aus gespeicherten Zeilen. */
export const quarterLabelForDate = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return `Q${quarterOf(parsed)}/${parsed.getFullYear()}`;
};

// ---------------------------------------------------------------------------
// Zeilen und Eingaben
// ---------------------------------------------------------------------------

export type EhrenamtsbonusRequest = {
  id: string;
  userId: string;
  status: EhrenamtsbonusStatus;
  currentAccess: AccessLevel;
  requestedOption: BonusOption;
  werkbereiche: string[];
  validFrom: string;
  validUntil: string;
  reason: string;
  decisionNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

/** Annehmen oder ablehnen — mehr Wege aus der Prüfung gibt es nicht. */
export type EhrenamtsbonusDecision = "approve" | "reject";

/** Antrag plus alles, was nur der Vorstand sieht. */
export type EhrenamtsbonusAdminRequest = EhrenamtsbonusRequest & {
  applicantName: string | null;
  applicantMemberNumber: string | null;
  /** Live aus Campai, nie gespeichert. `null` = nicht abrufbar. */
  openBalanceCents: number | null;
  decidedByName: string | null;
};

export type EhrenamtsbonusInput = {
  requestedOption: BonusOption;
  werkbereiche: string[];
  validFrom: string;
  reason: string;
};

const SELECT_FIELDS = [
  "id",
  "user_id",
  "status",
  "current_access",
  "requested_option",
  "werkbereiche",
  "valid_from",
  "valid_until",
  "reason",
  "decision_note",
  "decided_by",
  "decided_at",
  "created_at",
].join(", ");

const readText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const readOptionalText = (value: unknown) => {
  const text = readText(value);
  return text ? text : null;
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const WERKBEREICH_SLUGS = new Set(WERKBEREICHE.map((entry) => entry.slug));

/** Werkbereiche einer Zeile: nur bekannte Slugs, ohne Dubletten. */
const readSlugList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => readText(entry))
        .filter((slug) => WERKBEREICH_SLUGS.has(slug)),
    ),
  );
};

const parseFromList = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null => {
  const text = readText(value).toLowerCase();
  return (allowed as readonly string[]).includes(text) ? (text as T) : null;
};

export const parseStatus = (value: unknown) =>
  parseFromList(value, EHRENAMTSBONUS_STATUSES);
export const parseAccessLevel = (value: unknown) =>
  parseFromList(value, ACCESS_LEVELS);
export const parseBonusOption = (value: unknown) =>
  parseFromList(value, BONUS_OPTIONS);
export const parseDecision = (value: unknown) =>
  parseFromList(value, ["approve", "reject"] as const);

export const mapRequestRow = (
  row: Record<string, unknown>,
): EhrenamtsbonusRequest | null => {
  const id = readText(row.id);
  const userId = readText(row.user_id);
  const status = parseStatus(row.status);
  const currentAccess = parseAccessLevel(row.current_access);
  const requestedOption = parseBonusOption(row.requested_option);

  if (!id || !userId || !status || !currentAccess || !requestedOption) {
    return null;
  }

  return {
    id,
    userId,
    status,
    currentAccess,
    requestedOption,
    werkbereiche: readSlugList(row.werkbereiche),
    validFrom: readText(row.valid_from),
    validUntil: readText(row.valid_until),
    reason: readText(row.reason),
    decisionNote: readOptionalText(row.decision_note),
    decidedBy: readOptionalText(row.decided_by),
    decidedAt: readOptionalText(row.decided_at),
    createdAt: readText(row.created_at),
  };
};

export class EhrenamtsbonusValidationError extends Error {}

/**
 * Prüft die Eingaben des Antragsformulars. Wirft mit deutschem Klartext — die
 * Route reicht die Meldung unverändert durch, damit Server und Client dieselben
 * Sätze zeigen. Der Zugang steht bewusst nicht im Formular: er kommt aus den
 * Systemdaten und entscheidet allein, was der Bonus auslöst.
 */
export const parseEhrenamtsbonusInput = (
  body: Record<string, unknown>,
  validQuarterStarts: readonly string[],
): EhrenamtsbonusInput => {
  const fail: (message: string) => never = (message) => {
    throw new EhrenamtsbonusValidationError(message);
  };

  const requestedOption = parseBonusOption(body.requestedOption);
  if (!requestedOption) {
    fail("Bitte wählen, welchen Bonus du beantragst.");
  }

  const werkbereiche = readSlugList(body.werkbereiche);
  if (werkbereiche.length === 0) {
    fail("Bitte mindestens einen Werkbereich wählen, in dem du aktiv warst.");
  }

  const validFrom = readText(body.validFrom);
  if (!isIsoDate(validFrom) || !validQuarterStarts.includes(validFrom)) {
    fail(
      "Bitte einen Quartalsbeginn wählen — der Bonus wirkt nie rückwirkend.",
    );
  }

  const reason = readText(body.reason);
  if (reason.length < 20) {
    fail(
      "Bitte beschreibe dein Engagement in mindestens 20 Zeichen, damit der Vorstand es einordnen kann.",
    );
  }
  if (reason.length > 2000) {
    fail("Die Beschreibung darf höchstens 2000 Zeichen lang sein.");
  }

  return {
    requestedOption,
    werkbereiche,
    validFrom,
    reason,
  };
};

export const inputToRow = (
  input: EhrenamtsbonusInput,
  userId: string,
  context: { access: AccessLevel },
) => {
  const from = new Date(`${input.validFrom}T00:00:00`);

  return {
    user_id: userId,
    status: "in_review" satisfies EhrenamtsbonusStatus,
    current_access: context.access,
    requested_option: input.requestedOption,
    werkbereiche: input.werkbereiche,
    valid_from: input.validFrom,
    valid_until: quarterEndDate(from.getFullYear(), quarterOf(from)),
    reason: input.reason,
  };
};

// ---------------------------------------------------------------------------
// Abfragen
// ---------------------------------------------------------------------------

const mapRows = (data: unknown[] | null) =>
  (data ?? [])
    .map((row) => mapRequestRow(row as unknown as Record<string, unknown>))
    .filter((row): row is EhrenamtsbonusRequest => Boolean(row));

/**
 * Anträge eines Mitglieds, neueste zuerst. Fehlt die Tabelle noch (Migration
 * nicht eingespielt), bleibt die Seite leer statt zu brechen — dasselbe
 * Verhalten wie bei den member_profiles.
 */
export const listOwnRequests = async (
  client: SupabaseClient,
  userId: string,
): Promise<EhrenamtsbonusRequest[]> => {
  const { data, error } = await client
    .from(EHRENAMTSBONUS_TABLE)
    .select(SELECT_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error, EHRENAMTSBONUS_TABLE)) {
      return [];
    }
    throw error;
  }

  return mapRows(data);
};

export const listAllRequests = async (
  client: SupabaseClient,
): Promise<EhrenamtsbonusRequest[]> => {
  const { data, error } = await client
    .from(EHRENAMTSBONUS_TABLE)
    .select(SELECT_FIELDS)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error, EHRENAMTSBONUS_TABLE)) {
      return [];
    }
    throw error;
  }

  return mapRows(data);
};
