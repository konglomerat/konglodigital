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
  "cancelled",
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
  EhrenamtsbonusStatus | "expiring" | "expired";

export const EHRENAMTSBONUS_STATUS_LABELS: Record<
  EhrenamtsbonusDisplayStatus,
  string
> = {
  in_review: "In Prüfung",
  approved: "Angenommen",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
  expiring: "Läuft ab",
  expired: "Abgelaufen",
};

// Angenommen läuft auf der grünen Tint-Stufe („gebucht"), abgelehnt auf der
// roten („offen").
export const EHRENAMTSBONUS_STATUS_TONES: Record<
  EhrenamtsbonusDisplayStatus,
  BadgeTone
> = {
  in_review: "neu",
  approved: "gebucht",
  rejected: "offen",
  cancelled: "neutral",
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

/** Heutiges Datum als ISO-Tag — ISO-Tage lassen sich direkt vergleichen. */
const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Läuft der Bonus heute schon, oder beginnt er erst? */
export const isRunning = (
  request: Pick<EhrenamtsbonusRequest, "validFrom" | "validUntil">,
  now = new Date(),
) => {
  const today = toIsoDate(now);
  return request.validFrom <= today && today <= request.validUntil;
};

/**
 * Der Bonus, den die Kontoseite zeigt: der laufende, sonst der nächste schon
 * angenommene.
 */
export const findActiveRequest = (
  requests: readonly EhrenamtsbonusRequest[],
  now = new Date(),
): EhrenamtsbonusRequest | null => {
  const today = toIsoDate(now);
  const live = requests
    .filter(
      (request) => request.status === "approved" && request.validUntil >= today,
    )
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));

  return live.find((request) => request.validFrom <= today) ?? live[0] ?? null;
};

/**
 * Der Antrag, der einen neuen verhindert: einer je Mitglied, solange er auf
 * die Entscheidung des Vorstands wartet oder sein Bonus noch läuft. Was
 * abgelehnt, storniert oder abgelaufen ist, blockiert nichts — nach einer
 * Ablehnung darf beliebig oft neu gestellt werden.
 */
export const findBlockingRequest = (
  requests: readonly EhrenamtsbonusRequest[],
  now = new Date(),
): EhrenamtsbonusRequest | null => {
  const today = toIsoDate(now);
  return (
    requests.find(
      (request) =>
        request.status === "in_review" ||
        (request.status === "approved" && request.validUntil >= today),
    ) ?? null
  );
};

/** ISO-Tag als deutsches Datum — für Sätze, die Server und Client teilen. */
const formatGermanDate = (isoDate: string) => {
  const parsed = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? isoDate
    : parsed.toLocaleDateString("de-DE");
};

/**
 * Warum gerade kein Antrag geht. Steht einmal hier, damit die abgewiesene
 * Absendung dieselbe Begründung nennt wie der Hinweis, der das Formular
 * ersetzt.
 */
export const blockedMessage = (request: EhrenamtsbonusRequest) =>
  request.status === "in_review"
    ? `Dein Antrag für ${quarterLabelForDate(request.validFrom)} wird noch geprüft. Solange darüber nicht entschieden ist, kannst du keinen weiteren stellen.`
    : `Dein Bonus für ${quarterLabelForDate(request.validFrom)} läuft noch bis zum ${formatGermanDate(request.validUntil)}. Einen neuen Antrag kannst du stellen, sobald er ausgelaufen ist.`;

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
  abo_klein: "Abo klein",
  abo_gross: "Abo groß",
};

/**
 * Dasselbe mit dem Preis dahinter, den Campai heute für die Stufe führt —
 * überall dort, wo ein Mitglied oder der Vorstand die Stufe abliest.
 */
export const accessLevelLabel = (
  access: AccessLevel,
  prices: TariffPrices = FALLBACK_TARIFF_PRICES,
) => {
  const label = ACCESS_LEVEL_LABELS[access];

  if (access === "abo_klein") {
    return `${label} (${formatEuroShort(prices.aboKleinMonatCents)})`;
  }

  if (access === "abo_gross") {
    return `${label} (${formatEuroShort(prices.aboGrossMonatCents)})`;
  }

  return label;
};

/** Die beantragbaren Optionen — die Spalten der Matrix. */
export const BONUS_OPTIONS = ["tage_10", "unbegrenzt", "anerkennung"] as const;

export type BonusOption = (typeof BONUS_OPTIONS)[number];

export const BONUS_OPTION_LABELS: Record<BonusOption, string> = {
  tage_10: "10 Tage pro Quartal",
  unbegrenzt: "Uneingeschränkter Zugang",
  anerkennung: "Nur Anerkennung",
};

/** Kurzform für Kacheln — so knapp wie die Tarifnamen auf der Kontoseite. */
export const BONUS_OPTION_SHORT_LABELS: Record<BonusOption, string> = {
  tage_10: "10 Tage",
  unbegrenzt: "24/7-Zugang",
  anerkennung: "Anerkennung",
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

// Die Tarife, aus denen sich der entgangene Beitrag rechnet. Sie stehen nicht
// hier, sondern in Campai: `fetchCampaiTariffPrices` holt sie aus dem
// Tarifkatalog, die Server-Hülle reicht sie an die Clients weiter.
// Uneingeschränkter Zugang ist das, was das große Abo kostet.
export type TariffPrices = {
  /** Was zehn Zugänge kosten — der Preis einer Punktekarte. */
  punktekarteCents: number;
  aboKleinMonatCents: number;
  aboGrossMonatCents: number;
};

/**
 * Wonach gerechnet wird, solange Campai nichts sagt — der Stand bei
 * Einführung des Features. Ein Antrag bleibt so auch dann stellbar und
 * entscheidbar, wenn der Tarifabruf ausfällt.
 */
export const FALLBACK_TARIFF_PRICES: TariffPrices = {
  punktekarteCents: 5000,
  aboKleinMonatCents: 1500,
  aboGrossMonatCents: 3000,
};

const MONATE_PRO_QUARTAL = 3;

const roseguarden = (label: string): SystemAction => ({
  target: "roseguarden",
  label,
});

const campai = (label: string): SystemAction => ({ target: "campai", label });

// Ein bestehendes Abo wird für den Bonuszeitraum pausiert und durch die
// beantragte Option ersetzt — dieselbe Regel für beide Abos und beide
// Optionen. Entgangen ist dem Verein damit genau der Beitrag des Quartals,
// unabhängig davon, was das Mitglied stattdessen bekommt.
const aboPause = (
  access: AccessLevel,
  prices: TariffPrices,
): { action: SystemAction; quartalCents: number } | null => {
  if (access === "abo_klein") {
    return {
      action: campai("Abo klein pausieren"),
      quartalCents: MONATE_PRO_QUARTAL * prices.aboKleinMonatCents,
    };
  }

  if (access === "abo_gross") {
    return {
      action: campai("Abo groß pausieren"),
      quartalCents: MONATE_PRO_QUARTAL * prices.aboGrossMonatCents,
    };
  }

  return null;
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
  periodLabel?: string,
): string => {
  // „Bonuszeitraum Q1/2027" — ohne Quartal bleibt es beim bloßen Wort.
  const zeitraum = periodLabel
    ? `Bonuszeitraum ${periodLabel}`
    : "Bonuszeitraum";

  if (hasAbo) {
    return option === "unbegrenzt"
      ? access === "abo_gross"
        ? `Dein Abo pausiert im ${zeitraum}, dein 24/7-Zugang bleibt.`
        : `Dein Abo pausiert im ${zeitraum} — stattdessen hast du uneingeschränkten Zugang.`
      : `Dein Abo pausiert im ${zeitraum} — stattdessen bekommst du 10 Zugänge.`;
  }

  if (option === "unbegrenzt") {
    return access === "keine_karte"
      ? `Du bekommst eine Zugangskarte mit uneingeschränktem Zugang für den ${zeitraum}.`
      : `Deine Karte wird für den ${zeitraum} auf 24/7-Zugang gehoben.`;
  }

  return access === "keine_karte"
    ? `Du bekommst eine Zugangskarte mit 10 Zugängen für den ${zeitraum}.`
    : `Dir werden 10 Zugänge für den ${zeitraum} gutgeschrieben.`;
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
  prices: TariffPrices = FALLBACK_TARIFF_PRICES,
  /** Das Quartal für die Vorschau, z. B. „Q1/2027". */
  periodLabel?: string,
): BonusOutcome => {
  if (option === "anerkennung") {
    return {
      summary:
        "An deiner Mitgliedschaft ändert sich nichts — dein Einsatz wird im Profil sichtbar.",
      actions: [],
      forgoneCents: 0,
    };
  }

  const pause = aboPause(access, prices);
  const grant = grantActions(access, option);

  return {
    summary: summaryFor(access, option, Boolean(pause), periodLabel),
    actions: pause ? [pause.action, ...grant] : grant,
    forgoneCents: pause
      ? pause.quartalCents
      : option === "unbegrenzt"
        ? MONATE_PRO_QUARTAL * prices.aboGrossMonatCents
        : prices.punktekarteCents,
  };
};

export const formatEuro = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

/**
 * Dasselbe ohne „,00" bei glatten Beträgen — in einer Beschriftung wie
 * „Abo klein (15 €)" lenken die Nachkommastellen nur ab. In Summen, die sich
 * addieren, stehen sie weiter.
 */
export const formatEuroShort = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
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
 * Das einzige Quartal, für das heute beantragt werden kann: das kommende.
 */
export const nextQuarterStart = (now = new Date()): QuarterStart => {
  // Das laufende Quartal (1..4) ist zugleich der Nullindex des kommenden.
  const offset = quarterOf(now);
  const year = now.getFullYear() + Math.floor(offset / 4);
  const quarter = (offset % 4) + 1;
  return {
    value: quarterStartDate(year, quarter),
    label: `Q${quarter}/${year}`,
    year,
    quarter,
  };
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
  /** Nur bei `cancelled` gesetzt — die Begründung, die das Mitglied liest. */
  cancellationNote: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

/** Annehmen oder ablehnen — mehr Wege aus der Prüfung gibt es nicht. */
export type EhrenamtsbonusDecision = "approve" | "reject";

/**
 * Was der Vorstand an einem Antrag tun kann. Stornieren ist keine Entscheidung
 * über einen offenen Antrag, sondern die Rücknahme einer schon getroffenen:
 * sie trifft nur angenommene Anträge und braucht immer eine Begründung.
 */
export type EhrenamtsbonusAdminAction = EhrenamtsbonusDecision | "cancel";

/** Antrag plus alles, was nur der Vorstand sieht. */
export type EhrenamtsbonusAdminRequest = EhrenamtsbonusRequest & {
  applicantName: string | null;
  applicantMemberNumber: string | null;
  cancelledByName: string | null;
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
  "cancellation_note",
  "cancelled_by",
  "cancelled_at",
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
export const parseAdminAction = (value: unknown) =>
  parseFromList(value, ["approve", "reject", "cancel"] as const);

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
    cancellationNote: readOptionalText(row.cancellation_note),
    cancelledBy: readOptionalText(row.cancelled_by),
    cancelledAt: readOptionalText(row.cancelled_at),
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
  quarterStart: string,
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
  if (!isIsoDate(validFrom) || validFrom !== quarterStart) {
    fail(
      "Der Bonus kann nur für das kommende Quartal beantragt werden — rückwirkend oder auf Vorrat geht es nicht.",
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
