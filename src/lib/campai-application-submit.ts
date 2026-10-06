// Mitgliedsantrag — Formular laden und Einreichung an Campai schicken.
//
// Die REST-API kann Anträge nur lesen, annehmen und ablehnen; *anlegen* geht
// dort nicht. Campais eigenes Einbettungsformular
// (app.campai.com/em/{kurz-ID}/applications/{formId}) schickt Anträge über
// öffentliche tRPC-Prozeduren unter cloud.campai.com/trpc — ohne API-Schlüssel,
// mit der Organisations-ID als einzigem Bezug. Genau die nutzen wir hier:
//
//   public.crm.applications.getForm           Formular (GET)
//   public.crm.applications.getUploadUrl      {id, url}: S3-PUT für Dateien
//   public.crm.applications.createSubmission  Antrag anlegen (POST)
//
// Die Einreichung landet dadurch ganz normal in Campai unter
// CRM → Anträge → Einreichungen und wird dort geprüft und angenommen.
//
// Achtung: Diese Prozeduren sind nicht dokumentiert (fehlen in
// /api/openapi.json). Ändert Campai sie, bricht die Seite — die Fehler-
// meldungen unten nennen deshalb die Prozedur.
import "server-only";

import {
  REGISTRATION_FORM_ID,
  type UploadedFile,
} from "@/lib/campai-registration";

const TRPC_BASE = "https://cloud.campai.com/trpc";

const getOrganizationId = () => {
  const organizationId = process.env.CAMPAI_ORGANIZATION_ID;
  if (!organizationId) {
    throw new Error("CAMPAI_ORGANIZATION_ID fehlt.");
  }
  return organizationId;
};

export const getRegistrationFormId = () =>
  process.env.CAMPAI_REGISTRATION_FORM_ID?.trim() || REGISTRATION_FORM_ID;

type TrpcError = { message?: string; data?: { validation?: unknown } };

/**
 * Campai hat die Eingabe abgelehnt. `validation` hält die Meldungen je
 * Datenpfad, z. B. `{ "address.zip": "Invalid zip" }` — damit kann der
 * Aufrufer sie dem passenden Feld zuordnen.
 */
export class CampaiValidationError extends Error {
  constructor(
    message: string,
    readonly validation: Record<string, string>,
  ) {
    super(message);
    this.name = "CampaiValidationError";
  }
}

/**
 * Ruft eine öffentliche Prozedur auf. Campai serialisiert die Antwort als
 * EJSON-String in `result.data` (IDs als `{ $oid }`); die Eingabe geht als
 * schlichtes JSON.
 */
const callTrpc = async <T>(
  procedure: string,
  input: Record<string, unknown>,
  { mutation = false, revalidate }: { mutation?: boolean; revalidate?: number } = {},
): Promise<T> => {
  const url = mutation
    ? `${TRPC_BASE}/${procedure}`
    : `${TRPC_BASE}/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`;

  const response = await fetch(url, {
    method: mutation ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      // So meldet sich das Einbettungsformular; Campai unterscheidet danach
      // die aufrufende Oberfläche.
      "x-client-app": "embeddable",
    },
    body: mutation ? JSON.stringify(input) : undefined,
    ...(revalidate === undefined
      ? { cache: "no-store" as const }
      : { next: { revalidate } }),
  });

  const payload = (await response.json().catch(() => null)) as {
    result?: { data?: unknown };
    error?: unknown;
  } | null;

  if (!response.ok || !payload?.result) {
    let detail: TrpcError | null = null;
    if (typeof payload?.error === "string") {
      try {
        detail = JSON.parse(payload.error) as TrpcError;
      } catch {
        detail = { message: payload.error };
      }
    } else if (payload?.error && typeof payload.error === "object") {
      detail = payload.error as TrpcError;
    }
    const validation = detail?.data?.validation;
    const message = `Campai ${procedure}: ${response.status} ${detail?.message ?? response.statusText}${
      validation ? ` ${JSON.stringify(validation)}` : ""
    }`;
    if (validation && typeof validation === "object") {
      throw new CampaiValidationError(
        message,
        validation as Record<string, string>,
      );
    }
    throw new Error(message);
  }

  const data = payload.result.data;
  return (typeof data === "string" ? JSON.parse(data) : data) as T;
};

type FormField = {
  id: string;
  key?: string;
  type: string;
  label?: string;
  bindPropertyPath?: string;
  format?: string;
  fields?: FormField[];
};

type FormGroup = {
  id: string;
  pageId?: string;
  label: string;
  itemCaption?: string;
  fields: FormField[];
};

export type ApplicationForm = { id: string; groups: FormGroup[] };

/** Das Antragsformular; fünf Minuten zwischengespeichert. */
export const fetchApplicationForm = async (
  applicationFormId = getRegistrationFormId(),
): Promise<ApplicationForm> => {
  const raw = await callTrpc<{ form?: { schema?: { groups?: FormGroup[] } } }>(
    "public.crm.applications.getForm",
    { organizationId: getOrganizationId(), applicationFormId },
    { revalidate: 300 },
  );

  return { id: applicationFormId, groups: raw.form?.schema?.groups ?? [] };
};

const DISPLAY_ONLY = new Set(["info", "html", "spacer", "termsPrivacy"]);

/**
 * Das Schema, das Campai neben den Werten speichert — eine flache Liste der
 * Eingabefelder je Gruppe, so wie Campais Einbettungsformular sie schickt.
 * Campai gleicht sie mit dem Formular ab und verwirft Unbekanntes.
 */
export const buildSubmissionSchema = (form: ApplicationForm) =>
  form.groups
    .map((group) => ({
      id: group.id,
      pageId: group.pageId,
      label: group.label,
      itemCaption: group.itemCaption,
      fields: group.fields
        .flatMap((field) =>
          field.type === "row" ? (field.fields ?? []) : [field],
        )
        .filter((field) => !DISPLAY_ONLY.has(field.type))
        .map((field) => ({
          id: field.id,
          key: field.key,
          type: field.type,
          label: field.label,
          bindPropertyPath: field.bindPropertyPath,
          ...(field.type === "text" ? { text: { format: field.format } } : {}),
        })),
    }))
    .filter((group) => group.fields.length > 0);

/** Legt eine PNG-Datei in Campais Speicher und gibt sie als Anhang zurück. */
export const uploadApplicationFile = async (
  applicationFormId: string,
  file: Buffer,
  fileName: string,
  contentType: string,
): Promise<UploadedFile> => {
  const { id, url } = await callTrpc<{ id: string; url: string }>(
    "public.crm.applications.getUploadUrl",
    { organizationId: getOrganizationId(), applicationFormId },
  );

  const upload = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(file),
  });
  if (!upload.ok) {
    throw new Error(`Campai-Upload: ${upload.status} ${upload.statusText}`);
  }

  return {
    resource: id,
    fileName,
    contentType,
    fileSizeBytes: file.byteLength,
  };
};

type CreateSubmissionResult =
  | { type: "submitted"; _id?: { $oid: string } | string }
  | { type: string; provider?: string };

/**
 * Legt den Antrag an. Das Formular erlaubt nur die Überweisung — Online-
 * Zahlung verlangte einen Checkout bei PayPal/Stripe, den diese Seite nicht
 * führt. Gibt die ID der Einreichung zurück.
 */
export const createApplicationSubmission = async (
  applicationFormId: string,
  submission: { schema: unknown; data: Record<string, unknown> },
  returnUrl: string,
): Promise<string> => {
  const result = await callTrpc<CreateSubmissionResult>(
    "public.crm.applications.createSubmission",
    {
      organizationId: getOrganizationId(),
      applicationFormId,
      submission,
      returnUrl,
      cancelUrl: returnUrl,
    },
    { mutation: true },
  );

  if (result.type !== "submitted") {
    throw new Error(
      `Campai createSubmission: unerwartete Antwort „${result.type}".`,
    );
  }

  const id = "_id" in result ? result._id : undefined;
  return typeof id === "string" ? id : (id?.$oid ?? "");
};
