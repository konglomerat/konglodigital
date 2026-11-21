// Mitgliedsanträge — die Campai-Aufrufe vom Eingang bis zur Aufnahme. Jede
// Funktion ist ein Endpunkt der REST-API (cloud.campai.com/api/openapi.json);
// die Form der Bodies ist am 2026-10-11 und 2026-11-16 live geprüft.
//
// Was Campai dabei nicht von selbst sagt:
// - Nach E-Mail sucht nur `userFilter` (als JSON-String), nicht `searchTerm`.
// - Die Duplikatprüfung beim Anlegen schlägt schon bei ähnlichen Namen an
//   (409) — gesucht wird deshalb vorher selbst, per E-Mail.
// - `types/add` vergibt beim Typ Mitglied sofort die Mitgliedsnummer, lässt
//   das Eintrittsdatum aber leer. `types/remove` will den Kontaktnamen als
//   Bestätigung, so wie `removal-impact` ihn liefert.
// - `createDebtor: true` beim Anlegen des Kontakts legt keinen Debitor an.
// - Verträge brauchen `options: []` und `pause: null`.
// - `contracts/collect` arbeitet asynchron: der Rechnungsentwurf erscheint
//   erst etwa 30 s später. Ein Entwurf hat noch keine Datei — die Vorschau
//   kommt aus `receipts/preview`.
// - Hochgeladene Dateien (`misc/storage/uploadUrl`) lassen sich genau einmal
//   verwenden.
// - Eine Nachricht mit mehr als 3 Anhängen wird ohne Fehler verworfen.
import "server-only";

import { normalizePhone } from "@/lib/campai-registration";
import { loadCampaiConfig } from "@/lib/campai-receipts/config";

import type { ApplicationData, ApplicationInvoice } from "./types";

/** Zusatzfelder am Mitglied, an denen der Preis des Jahresbeitrags hängt. */
const ANNUAL_FEE_FIELD = "iSsJ-bIIVANYkzHDLnbcx";
const TRIAL_RATE_FIELD = "yuJULD";
/** Benutzerdefiniertes Textfeld „Kartennummer" am Mitglied (Zugangskarte für Roseguarden). */
const CARD_NUMBER_FIELD = "5qO2LW";

const MAX_ATTACHMENTS = 3;
const PAGE_SIZE = 100;

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const list = (value: unknown): JsonRecord[] =>
  Array.isArray(value)
    ? value.map(record).filter((entry): entry is JsonRecord => Boolean(entry))
    : [];

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const campaiDate = (day: string) => `${day}T00:00:00.000Z`;

export class CampaiError extends Error {}

const request = async (
  url: string,
  { method, body }: { method?: string; body?: unknown } = {},
): Promise<unknown> => {
  const { apiKey } = loadCampaiConfig();
  const response = await fetch(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const raw = await response.text();
  if (!response.ok) {
    // Campai meldet Validierungs- und Rechtefehler mit lesbarer `message`.
    let message = raw.slice(0, 300);
    try {
      const parsed = record(JSON.parse(raw));
      const validation = record(record(parsed?.data)?.validation);
      message =
        [text(parsed?.message), validation ? JSON.stringify(validation) : ""]
          .filter(Boolean)
          .join(" ") || message;
    } catch {
      // Kein JSON — Rohtext bleibt.
    }
    throw new CampaiError(`Campai ${response.status}: ${message}`);
  }
  return raw ? JSON.parse(raw) : null;
};

const mandate = (path: string, options?: { method?: string; body?: unknown }) =>
  request(`${loadCampaiConfig().baseUrl}/${path}`, options);

// --- Kontakt und Debitor ----------------------------------------------------

const contactPath = (contactId: string) => `crm/contacts/${encodeURIComponent(contactId)}`;

const tagsOf = (contact: JsonRecord | null) =>
  Array.isArray(contact?.tags) ? contact.tags.filter((tag): tag is string => typeof tag === "string") : [];

const typesOf = (contact: JsonRecord | null) =>
  Array.isArray(contact?.types) ? contact.types.filter((type): type is string => typeof type === "string") : [];

/** Der Kontakt mit dieser E-Mail-Adresse — und was Campai schon über ihn weiß. */
export const findContactByEmail = async (email: string) => {
  const filter = {
    operator: "and",
    groups: [
      {
        operator: "and",
        fields: [
          { path: "communication.email", comparator: "equals", value: email.trim().toLowerCase() },
        ],
      },
    ],
  };
  const result = record(
    await mandate("crm/contacts/list", {
      body: { limit: 5, userFilter: JSON.stringify(filter) },
    }),
  );
  // Mehrere Treffer: das Mitglied zuerst, sonst der älteste Kontakt.
  const [contact] = list(result?.contacts).sort(
    (a, b) =>
      Number(typesOf(b).includes("member")) - Number(typesOf(a).includes("member")) ||
      text(a.createdAt).localeCompare(text(b.createdAt)),
  );
  if (!contact) return null;
  const memberNumber = text(record(contact.contactNumbers)?.member) || null;
  const member = record(contact.member);
  return {
    contactId: text(contact._id),
    existing: {
      memberNumber,
      activeMember:
        typesOf(contact).includes("member") && Boolean(member?.entryAt) && !member?.exitAt,
      tags: tagsOf(contact),
    },
  };
};

const applicationAddress = (data: ApplicationData) => ({
  country: "DE",
  zip: data.zip.trim(),
  city: data.city.trim(),
  addressLine: data.street.trim(),
});

/** Die Person aus dem Antrag als Kontakt ohne Mitgliedschaft (Typ Adresse). */
export const createApplicantContact = async (data: ApplicationData) => {
  const created = record(
    await mandate("crm/contacts", {
      body: {
        type: "address",
        language: "de",
        person: {
          title: "",
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          birthdate: null,
          gender: null,
        },
        // Telefonnummern nimmt erst das Update an (setMemberDetails).
        communication: { email: data.email.trim().toLowerCase() },
        address: applicationAddress(data),
        // Gesucht ist schon per E-Mail; Campais Prüfung hält ähnliche Namen
        // für Dubletten.
        makeDuplicateCheck: false,
      },
    }),
  );
  const id = text(created?._id);
  if (!id) throw new CampaiError("Campai hat den Kontakt ohne ID angelegt.");
  return id;
};

/** Ergänzt Tags; die vorhandenen bleiben (das Update ersetzt die ganze Liste). */
export const addContactTags = async (contactId: string, tags: string[]) => {
  const current = tagsOf(record(await mandate(contactPath(contactId))));
  const next = [...new Set([...current, ...tags])];
  if (next.length === current.length) return;
  await mandate(contactPath(contactId), { body: { tags: next } });
};

/**
 * Macht aus dem Kontakt ein Mitglied: Typ Mitglied ergänzen, Name, Anschrift,
 * E-Mail und Eintritt aus dem (ggf. korrigierten) Antrag, dann den Typ
 * Adresse entfernen. Jeder Teil prüft vorher den Stand — ein zweiter Aufruf
 * nach einem Abbruch macht nichts doppelt.
 */
export const makeMember = async (contactId: string, data: ApplicationData) => {
  let contact = record(await mandate(contactPath(contactId)));
  // Ein Mitglied mit Eintritt und ohne Austritt hat schon Verträge. Solange
  // der Typ Adresse noch dransteht, ist es der eigene halbe Versuch von eben.
  const member = record(contact?.member);
  if (
    typesOf(contact).includes("member") &&
    !typesOf(contact).includes("address") &&
    member?.entryAt &&
    !member.exitAt
  ) {
    throw new CampaiError(
      `Die Person ist in Campai schon Mitglied (Nr. ${text(record(contact?.contactNumbers)?.member) || "?"}). Bitte dort prüfen, statt den Antrag anzunehmen.`,
    );
  }
  if (!typesOf(contact).includes("member")) {
    await mandate(`${contactPath(contactId)}/types/add`, { body: { type: "member" } });
    contact = record(await mandate(contactPath(contactId)));
  }

  // Mitgeschickte Blöcke müssen vollständig sein.
  const person = record(contact?.person) ?? {};
  const communication = { ...(record(contact?.communication) ?? {}) };
  delete communication.greetings;
  const address = record(contact?.address) ?? {};
  await mandate(contactPath(contactId), {
    body: {
      person: {
        salutation: person.salutation ?? "",
        gender: person.gender ?? null,
        title: person.title ?? "",
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        institutionName: person.institutionName ?? "",
        printInstitutionOnAddress: person.printInstitutionOnAddress ?? false,
        birthdate: person.birthdate ?? null,
      },
      communication: { ...communication, email: data.email.trim().toLowerCase() },
      // Bundesland und Zusatzzeilen hat der Antrag nicht — die bleiben.
      address: {
        ...Object.fromEntries(
          ["state", "details1", "details2"].flatMap((key) =>
            address[key] == null ? [] : [[key, address[key]]],
          ),
        ),
        ...applicationAddress(data),
      },
      member: { entryAt: campaiDate(data.entryAt), exitAt: null },
    },
  });

  if (typesOf(contact).includes("address")) {
    const impact = record(
      await mandate(`${contactPath(contactId)}/types/address/removal-impact`),
    );
    const blockers = list(impact?.blockers);
    if (blockers.length > 0) {
      throw new CampaiError(
        `Campai lässt den Typ Adresse nicht entfernen: ${JSON.stringify(blockers).slice(0, 200)}`,
      );
    }
    await mandate(`${contactPath(contactId)}/types/remove`, {
      body: {
        type: "address",
        revision: text(impact?.revision),
        acknowledged: true,
        confirmationName: text(impact?.contactName),
      },
    });
  }
};

const readContact = async (contactId: string) => {
  const contact = record(await mandate(`crm/contacts/${encodeURIComponent(contactId)}`));
  const account = Number(record(contact?.debtor)?.account);
  return {
    memberNumber: text(record(contact?.contactNumbers)?.member) || null,
    debtorAccount: Number.isInteger(account) && account > 0 ? account : null,
  };
};

export const readMemberNumber = async (contactId: string) =>
  (await readContact(contactId)).memberNumber;

/** Name und Typen, wie sie in Campai stehen — für viele Kontakte in einem Aufruf je 100. */
export const readContactSummaries = async (contactIds: string[]) => {
  const summaries = new Map<string, { name: string; member: boolean }>();
  const unique = [...new Set(contactIds)];
  for (let start = 0; start < unique.length; start += PAGE_SIZE) {
    const ids = unique.slice(start, start + PAGE_SIZE);
    const result = record(
      await mandate("crm/contacts/list", {
        body: { limit: PAGE_SIZE, selection: { ids } },
      }),
    );
    for (const contact of list(result?.contacts)) {
      summaries.set(text(contact._id), {
        name: text(contact.name),
        member: typesOf(contact).includes("member"),
      });
    }
  }
  return summaries;
};

/**
 * Legt den Debitor an, falls er fehlt, und stellt die Zahlungsart auf
 * Überweisung. E-Mail, Anschrift und Rechnungsversand per E-Mail übernimmt
 * Campai beim Anlegen vom Kontakt.
 */
export const ensureDebtor = async (contactId: string) => {
  let { debtorAccount } = await readContact(contactId);
  if (!debtorAccount) {
    await mandate(`crm/contacts/${encodeURIComponent(contactId)}/debtor`, {
      body: {
        currentDebtorAction: null,
        newDebtorAction: "create",
        newDebtorAccountToAssign: null,
      },
    });
    ({ debtorAccount } = await readContact(contactId));
  }
  if (!debtorAccount) {
    throw new CampaiError("Campai hat keinen Debitor angelegt.");
  }

  const debtor = record(await mandate(`finance/accounts/debtors/${debtorAccount}`));
  const debtorId = text(debtor?._id);
  if (!debtorId) throw new CampaiError(`Debitor ${debtorAccount} nicht gefunden.`);
  await mandate(`finance/accounts/debtors/${encodeURIComponent(debtorId)}/payment`, {
    body: {
      paymentMethodType: "sepaCreditTransfer",
      sepaDirectDebitMandate: null,
      onlinePayment: null,
    },
  });
  return debtorAccount;
};

/**
 * Beitragsfelder und Telefonnummern. Ein mitgeschickter Block muss vollständig
 * sein, deshalb kommt `communication` aus dem gelesenen Kontakt.
 */
export const setMemberDetails = async (contactId: string, data: ApplicationData) => {
  const contact = record(
    await mandate(`crm/contacts/${encodeURIComponent(contactId)}`),
  );
  const communication = { ...(record(contact?.communication) ?? {}) };
  delete communication.greetings;
  await mandate(`crm/contacts/${encodeURIComponent(contactId)}`, {
    body: {
      communication: {
        ...communication,
        phone: normalizePhone(data.phone) ?? "",
        mobilePhone: normalizePhone(data.mobilePhone) ?? "",
      },
      customFields: {
        member: {
          [ANNUAL_FEE_FIELD]: data.annualFee,
          [TRIAL_RATE_FIELD]: data.trialRate,
        },
      },
    },
  });
};

/**
 * Trägt die Nummer der Zugangskarte ins Zusatzfeld „Kartennummer" ein; leer
 * nimmt sie wieder heraus. Die übrigen Zusatzfelder kommen aus dem gelesenen
 * Kontakt mit, damit keins verloren geht.
 */
export const setCardNumber = async (contactId: string, cardNumber: string) => {
  const contact = record(
    await mandate(`crm/contacts/${encodeURIComponent(contactId)}`),
  );
  const member = record(record(contact?.customFields)?.member) ?? {};
  await mandate(`crm/contacts/${encodeURIComponent(contactId)}`, {
    body: {
      customFields: { member: { ...member, [CARD_NUMBER_FIELD]: cardNumber } },
    },
  });
};

// --- Dateien ----------------------------------------------------------------

/** Lädt eine Datei in Campais Speicher; die ID taugt für genau eine Verwendung. */
export const uploadFile = async (
  bytes: Uint8Array,
  fileName: string,
  contentType: string,
) => {
  const target = record(
    await request("https://cloud.campai.com/api/misc/storage/uploadUrl"),
  );
  const id = text(target?.id);
  const url = text(target?.url);
  if (!id || !url) throw new CampaiError("Campai hat keine Upload-Adresse geliefert.");

  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, "-");
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
    body: Buffer.from(bytes),
  });
  if (!response.ok) {
    throw new CampaiError(`Upload von ${fileName} fehlgeschlagen (${response.status}).`);
  }
  return id;
};

export const addContactDocument = async (
  contactId: string,
  name: string,
  resource: string,
  fileName: string,
) => {
  const created = record(
    await mandate(`crm/contacts/${encodeURIComponent(contactId)}/documents`, {
      body: {
        name,
        description: "",
        shareToContact: false,
        file: { fileName, resource },
      },
    }),
  );
  return text(created?._id) || resource;
};

// --- Verträge und Rechnung --------------------------------------------------

export const createContract = async (
  contactId: string,
  planId: string,
  startDay: string,
) => {
  const created = record(
    await mandate("crm/contracts", {
      body: {
        contactId,
        planId,
        startAt: campaiDate(startDay),
        options: [],
        pause: null,
      },
    }),
  );
  const id = text(created?._id);
  if (!id) throw new CampaiError("Campai hat den Vertrag ohne ID angelegt.");
  return id;
};

/**
 * Rechnet die fälligen Verträge als Entwurf ab. `false`, wenn nichts fällig
 * ist — collect antwortet sonst mit 500.
 */
export const collectDraft = async (contactId: string) => {
  const due = list(
    record(
      await mandate("crm/contracts/list", {
        body: { contactId, status: "collect", limit: PAGE_SIZE },
      }),
    )?.contracts,
  );
  if (due.length === 0) return false;

  await mandate("crm/contracts/collect", {
    body: {
      contactId,
      status: "collect",
      settings: { mode: "draft", mergeReceipts: true, createElectronicInvoices: false },
    },
  });
  return true;
};

const toInvoice = (receipt: JsonRecord): ApplicationInvoice => {
  const status = text(receipt.paymentStatus);
  const transfer = record(record(receipt.paymentMethod)?.sepaCreditTransfer);
  return {
    id: text(receipt._id),
    number: text(receipt.receiptNumber) || null,
    draft: Boolean(receipt.draft),
    amountCents: Number(receipt.totalGrossAmount) || 0,
    leftToPayCents: Number(receipt.totalAmountLeftToPay) || 0,
    paymentStatus: status === "paid" || status === "partial" ? status : "unpaid",
    dueDate: text(receipt.dueDate) || null,
    paidAt: text(receipt.paidAt) || null,
    fileName:
      text(receipt.receiptFileName) ||
      `Rechnung ${text(receipt.receiptNumber) || "Entwurf"}.pdf`,
    reference: text(transfer?.referenceId) || null,
    positions: list(receipt.positions).map((position) => ({
      description: text(position.description),
      amountCents: Number(position.amount) || 0,
    })),
  };
};

/**
 * Die neueste nicht stornierte Rechnung des Debitors seit `since` — auch als
 * Entwurf. Nach Debitor filtert nur die Volltextsuche, und die ist unscharf.
 */
export const findInvoice = async (debtorAccount: number, since: string) => {
  const sinceTime = new Date(since).getTime();
  const receipts = list(
    record(
      await mandate("finance/receipts/list", {
        body: { searchTerm: String(debtorAccount), limit: PAGE_SIZE },
      }),
    )?.receipts,
  )
    .filter(
      (receipt) =>
        Number(receipt.account) === debtorAccount &&
        receipt.type === "invoice" &&
        !receipt.canceledAt &&
        new Date(text(receipt.createdAt)).getTime() >= sinceTime,
    )
    .sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)));
  return receipts[0] ? toInvoice(receipts[0]) : null;
};

export const getInvoice = async (receiptId: string) =>
  toInvoice(
    record(await mandate(`finance/receipts/${encodeURIComponent(receiptId)}`)) ?? {},
  );

/** Das PDF der Rechnung — beim Entwurf die Vorschau, sonst die fertige Datei. */
export const invoicePdf = async (invoice: ApplicationInvoice) => {
  if (invoice.draft) {
    const preview = record(
      await mandate("finance/receipts/preview", { body: { receiptId: invoice.id } }),
    );
    const document = text(preview?.document);
    const base64 = document.slice(document.indexOf(",") + 1);
    if (!base64) throw new CampaiError("Campai hat keine Vorschau geliefert.");
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  const download = record(
    await mandate(`finance/receipts/${encodeURIComponent(invoice.id)}/download`),
  );
  const url = text(download?.url);
  if (!url) throw new CampaiError("Campai hat keine Download-Adresse geliefert.");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new CampaiError(`Rechnung ließ sich nicht laden (${response.status}).`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Schließt den Entwurf ab, ohne dass Campai ihn verschickt: erst den Versand
 * abschalten, dann abschließen. Danach hat die Rechnung Nummer und
 * Verwendungszweck.
 */
export const completeInvoice = async (invoiceId: string, email: string) => {
  await mandate(`finance/receipts/${encodeURIComponent(invoiceId)}/sendMethod`, {
    body: { sendMethod: "email", email, doNotSendReceipt: true },
  });
  await mandate("finance/receipts/complete", {
    body: { selection: { ids: [invoiceId] } },
  });
  const invoice = await getInvoice(invoiceId);
  if (invoice.draft || !invoice.number) {
    throw new CampaiError("Campai hat die Rechnung nicht abgeschlossen.");
  }
  return invoice;
};

// --- Nachrichten ------------------------------------------------------------

type Attachment = { fileName: string; resource: string };

/**
 * Freie Nachricht an einen Kontakt — wie „Nachricht senden" in Campai. Campai
 * nimmt den Text als Klartext (HTML käme als Quelltext an), Absätze sind
 * Leerzeilen. Antworten landen im Campai-Posteingang.
 */
export const sendTextMessage = async (contactId: string, subject: string, body: string) => {
  await mandate("crm/contacts/sendMessage", {
    body: {
      email: {
        subject: { de: subject, en: subject },
        message: { de: body, en: body },
        // Leer wie in der Oberfläche — siehe sendTemplateMessage.
        replyTo: "",
        sendToAlternativeCommunications: false,
        attachments: [],
      },
      letter: null,
      recipients: {
        selection: { ids: [contactId], selectedCount: 1, isAllSelected: false },
      },
    },
  });
};

/**
 * Schickt eine gestaltete Campai-Vorlage an einen Kontakt — wie „Nachricht
 * senden" in Campai. Angehängt wird nur `attachments` (die Rechnung); was an
 * der Vorlage hängt, bleibt weg — Satzung und Beitragsordnung sind schon im
 * Antrag verlinkt.
 */
/**
 * Die Vorlage als HTML, wie Campais Vorschau sie zeigt — Platzhalter
 * (Vorname usw.) bleiben markiert stehen.
 */
export const previewTemplate = async (templateId: string) => {
  const template = record(
    await mandate(`crm/messageTemplates/${encodeURIComponent(templateId)}`),
  );
  if (!template?.templateContents) {
    throw new CampaiError(`Vorlage ${templateId} ist leer oder fehlt.`);
  }
  const preview = record(
    await mandate(`crm/messageTemplates/${encodeURIComponent(templateId)}/preview`, {
      body: { templateContents: template.templateContents, type: "email" },
    }),
  );
  const html = text(preview?.document);
  if (!html) throw new CampaiError("Campai hat keine Vorschau geliefert.");
  return { subject: text(record(template.email)?.subject), html };
};

export const sendTemplateMessage = async (
  contactId: string,
  templateId: string,
  attachments: Attachment[] = [],
) => {
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new CampaiError(`Campai verschickt höchstens ${MAX_ATTACHMENTS} Anhänge.`);
  }
  const template = record(
    await mandate(`crm/messageTemplates/${encodeURIComponent(templateId)}`),
  );
  const subject = text(record(template?.email)?.subject);
  if (!template?.templateContents || !subject) {
    throw new CampaiError(`Vorlage ${templateId} ist leer oder fehlt.`);
  }

  await mandate("crm/contacts/sendMessage", {
    body: {
      expressaTemplateContents: template.templateContents,
      email: {
        subject: { de: subject, en: subject },
        message: { de: "", en: "" },
        // Leer wie in Campais Oberfläche. Mit der eigenen Posteingangsadresse
        // (office@portal…) antwortet Campai 200 und verwirft die Mail still.
        replyTo: "",
        sendToAlternativeCommunications: false,
        attachments,
      },
      letter: null,
      // Wie Campais Oberfläche bei einem einzelnen Kontakt.
      recipients: {
        selection: { ids: [contactId], selectedCount: 1, isAllSelected: false },
      },
    },
  });
};
