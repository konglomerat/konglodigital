// Ehrenamtsbonus — was nach der Entscheidung des Vorstands in Campai passiert:
// das Abo für den Bonuszeitraum pausieren und dem Mitglied schreiben.
//
// Pausiert wird über die Pausenregel „Ehrenamtsbonus“ am Beitragsplan (setzt
// den Betrag auf 0 €). Welche Verträge sie haben, sagt Campai — gesucht wird
// sie am Plan jedes Vertrags, nicht über feste IDs. Das Vertrags-Update
// ersetzt den ganzen Vertrag; alles außer der Pause geht deshalb so zurück,
// wie es gelesen wurde (wie beim Tarifwechsel in campai-tariff-change.ts).
import "server-only";

import { loadCampaiConfig } from "@/lib/campai-receipts/config";

import {
  ACCESS_LEVEL_LABELS,
  BONUS_OPTION_LABELS,
  type EhrenamtsbonusRequest,
  quarterLabelForDate,
  resolveOutcome,
} from "./ehrenamtsbonus";

const PAUSE_RULE_NAME = "Ehrenamtsbonus";
const PAGE_SIZE = 100;

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const campai = async (path: string, body?: unknown): Promise<unknown> => {
  const { apiKey, baseUrl } = loadCampaiConfig();
  const response = await fetch(`${baseUrl}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const raw = await response.text();
  if (!response.ok) {
    let message = raw.slice(0, 300);
    try {
      message = text(record(JSON.parse(raw))?.message) || message;
    } catch {
      // Kein JSON — Rohtext bleibt.
    }
    throw new Error(`Campai ${response.status}: ${message}`);
  }
  return raw ? JSON.parse(raw) : null;
};

const campaiDate = (day: string) => `${day}T00:00:00.000Z`;
const dayOf = (value: unknown) => text(value).slice(0, 10) || null;

const optionIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((entry) =>
          typeof entry === "string" ? entry : text(record(entry)?.option),
        )
        .filter(Boolean)
    : [];

/** Die ID der Pausenregel „Ehrenamtsbonus“ am Plan — oder null. */
const pauseRuleOf = async (
  planId: string,
  cache: Map<string, string | null>,
) => {
  if (!cache.has(planId)) {
    const plan = record(
      await campai(`crm/plans/${encodeURIComponent(planId)}`),
    );
    const rules = Array.isArray(plan?.pauseRules) ? plan.pauseRules : [];
    const rule = rules
      .map(record)
      .find((entry) => text(entry?.name) === PAUSE_RULE_NAME);
    cache.set(planId, text(rule?.id) || null);
  }
  return cache.get(planId) ?? null;
};

export type PauseResult = {
  /** Verträge, deren Pause gesetzt bzw. geändert wurde. */
  contracts: { id: string; plan: string }[];
};

const listContracts = async (contactId: string) => {
  const list = record(
    await campai("crm/contracts/list", {
      limit: PAGE_SIZE,
      offset: 0,
      contactId,
    }),
  );
  return (Array.isArray(list?.contracts) ? list.contracts : [])
    .map(record)
    .filter((contract): contract is JsonRecord => Boolean(contract?._id))
    .filter((contract) => !contract.terminatedAt);
};

/** Schreibt den Vertrag mit neuer Pause zurück; alles andere wie gelesen. */
const writePause = async (
  contract: JsonRecord,
  contactId: string,
  planId: string,
  pause: { ruleId: string; startAt: string; endAt: string } | null,
) => {
  const customFields = record(contract.customFields);
  await campai(`crm/contracts/${encodeURIComponent(text(contract._id))}`, {
    planId,
    contactId,
    options: optionIds(contract.options),
    startAt: contract.startAt,
    endAt: contract.endAt ?? null,
    pause,
    voucher: contract.voucher ?? null,
    fixedAmount: contract.fixedAmount ?? null,
    flexibleInterval: contract.flexibleInterval ?? null,
    // Ein leeres `{}` lehnt Campai ab, wenn der Plan keine Zusatzfelder kennt.
    ...(customFields && Object.keys(customFields).length > 0
      ? { customFields }
      : {}),
  });
};

const planName = (contract: JsonRecord, planId: string) =>
  text(record(contract.plan)?.name) || planId;

/**
 * Pausiert jedes Abo des Kontakts, das im Bonuszeitraum läuft und dessen Plan
 * die Regel „Ehrenamtsbonus“ kennt. Wirft, wenn es keins gibt — dann stimmt
 * etwas am Antrag oder in Campai nicht, und der Vorstand soll es sehen.
 */
export const pauseAboForBonus = async (
  contactId: string,
  validFrom: string,
  validUntil: string,
): Promise<PauseResult> => {
  const contracts = (await listContracts(contactId)).filter((contract) => {
    const start = dayOf(contract.startAt);
    const end = dayOf(contract.endAt);
    // Läuft irgendwann im Bonuszeitraum.
    return (!start || start <= validUntil) && (!end || end >= validFrom);
  });

  const rules = new Map<string, string | null>();
  const paused: PauseResult["contracts"] = [];
  for (const contract of contracts) {
    const planId = text(record(contract.plan)?.plan);
    if (!planId) continue;
    const ruleId = await pauseRuleOf(planId, rules);
    if (!ruleId) continue;
    await writePause(contract, contactId, planId, {
      ruleId,
      startAt: campaiDate(validFrom),
      endAt: campaiDate(validUntil),
    });
    paused.push({ id: text(contract._id), plan: planName(contract, planId) });
  }

  if (paused.length === 0) {
    throw new Error(
      "In Campai läuft im Bonuszeitraum kein Abo mit der Pausenregel „Ehrenamtsbonus“.",
    );
  }
  return { contracts: paused };
};

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * Hebt die Ehrenamtsbonus-Pause wieder auf (Stornierung). Hat der Bonus noch
 * nicht begonnen, fällt die Pause ganz weg; läuft er schon, endet sie gestern
 * — die schon beitragsfreien Tage bleiben es, ab heute zählt der Beitrag
 * wieder. Getroffen wird nur die Pause dieses Bonus (Regel und Beginn).
 * Ohne passende Pause gibt es nichts zu tun: dann ist `contracts` leer.
 */
export const unpauseAboForBonus = async (
  contactId: string,
  validFrom: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<PauseResult> => {
  const rules = new Map<string, string | null>();
  const changed: PauseResult["contracts"] = [];
  for (const contract of await listContracts(contactId)) {
    const pause = record(contract.pause);
    const planId = text(record(contract.plan)?.plan);
    if (!pause || !planId) continue;
    const ruleId = await pauseRuleOf(planId, rules);
    if (!ruleId || text(pause.ruleId) !== ruleId) continue;
    if (dayOf(pause.startAt) !== validFrom) continue;

    const yesterday = addDays(today, -1);
    const next =
      yesterday < validFrom
        ? null
        : {
            ruleId,
            startAt: campaiDate(validFrom),
            endAt: campaiDate(yesterday),
          };
    // Schon vorbei: nichts mehr zu ändern.
    if (next && dayOf(pause.endAt) && dayOf(pause.endAt)! <= yesterday)
      continue;
    await writePause(contract, contactId, planId, next);
    changed.push({ id: text(contract._id), plan: planName(contract, planId) });
  }
  return { contracts: changed };
};

// --- Nachrichten ------------------------------------------------------------
//
// Campai nimmt den Text einer freien Nachricht als Klartext: HTML käme als
// Quelltext an (live gesehen 2026-10-30). Absätze daher als Leerzeilen.

const formatDay = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
};

const greeting = (firstName: string | null) =>
  firstName ? `Hallo ${firstName},` : "Hallo,";

const SIGNATURE = "Viele Grüße\nder Vorstand des Konglomerat e.V.";

/** Freie Nachricht an einen Kontakt über Campai — wie „Nachricht senden“ dort. */
export const sendMemberMessage = async (
  contactId: string,
  subject: string,
  body: string,
) => {
  await campai("crm/contacts/sendMessage", {
    email: {
      subject: { de: subject, en: subject },
      message: { de: body, en: body },
      // Leer wie in Campais Oberfläche — siehe membership-applications/campai.ts.
      replyTo: "",
      sendToAlternativeCommunications: false,
      attachments: [],
    },
    letter: null,
    recipients: {
      selection: { ids: [contactId], selectedCount: 1, isAllSelected: false },
    },
  });
};

/** Pausiert der Bonus ein Abo? Dann gilt der Hinweis zum Dauerauftrag. */
export const pausesAbo = (
  request: Pick<EhrenamtsbonusRequest, "currentAccess" | "requestedOption">,
) =>
  request.requestedOption !== "anerkennung" &&
  (request.currentAccess === "abo_klein" ||
    request.currentAccess === "abo_gross");

export const approvalMessage = (
  request: EhrenamtsbonusRequest,
  firstName: string | null,
) => {
  const period = quarterLabelForDate(request.validFrom);
  const from = formatDay(request.validFrom);
  const until = formatDay(request.validUntil);
  const outcome = resolveOutcome(
    request.currentAccess,
    request.requestedOption,
    period,
  );
  const standingOrder = pausesAbo(request)
    ? [
        "⚠️ WICHTIG – DAUERAUFTRAG PAUSIEREN",
        `Dein ${ACCESS_LEVEL_LABELS[request.currentAccess]} pausiert vom ${from} bis ${until}, der Monatsbeitrag dafür entfällt. Zahlst du ihn per Dauerauftrag, setze ihn bitte für diese Monate bei deiner Bank aus. Bei Lastschrift musst du nichts tun.`,
      ].join("\n")
    : null;

  return {
    subject: `Dein Ehrenamtsbonus für ${period} ist angenommen`,
    body: [
      greeting(firstName),
      "danke für deinen Einsatz im Verein! Der Vorstand hat deinen Antrag auf Ehrenamtsbonus angenommen.",
      `Bonus: ${BONUS_OPTION_LABELS[request.requestedOption]}\nZeitraum: ${period} (${from} bis ${until})`,
      outcome.summary,
      standingOrder,
      "Den Stand deines Antrags findest du jederzeit in deinem Konto unter „Ehrenamtsbonus“.",
      SIGNATURE,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
};

export const rejectionMessage = (
  request: EhrenamtsbonusRequest,
  firstName: string | null,
  note: string,
) => ({
  subject: `Dein Antrag auf Ehrenamtsbonus für ${quarterLabelForDate(request.validFrom)}`,
  body: [
    greeting(firstName),
    "danke für deinen Antrag auf Ehrenamtsbonus. Der Vorstand hat ihn leider abgelehnt. Die Begründung:",
    note.trim(),
    "Bei Fragen antworte einfach auf diese Nachricht oder sprich uns an.",
    SIGNATURE,
  ].join("\n\n"),
});

export const cancellationMessage = (
  request: EhrenamtsbonusRequest,
  firstName: string | null,
  note: string,
) => {
  const period = quarterLabelForDate(request.validFrom);
  const standingOrder = pausesAbo(request)
    ? [
        "⚠️ WICHTIG – DAUERAUFTRAG WIEDER AUFNEHMEN",
        `Die Pause deines ${ACCESS_LEVEL_LABELS[request.currentAccess]} ist aufgehoben, der Monatsbeitrag ist wieder fällig. Falls du deinen Dauerauftrag für den Bonus ausgesetzt hast, nimm ihn bitte wieder auf. Bei Lastschrift musst du nichts tun.`,
      ].join("\n")
    : null;
  return {
    subject: `Dein Ehrenamtsbonus für ${period} wurde storniert`,
    body: [
      greeting(firstName),
      `der Vorstand hat deinen Ehrenamtsbonus für ${period} storniert. Die Begründung:`,
      note.trim(),
      standingOrder,
      "Bei Fragen antworte einfach auf diese Nachricht oder sprich uns an.",
      SIGNATURE,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
};
