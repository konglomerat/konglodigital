// Mitgliedsantrag von /registration an Campai.
//
// Öffentlich — wer einen Antrag stellt, hat noch kein Konto. Die Eingaben
// werden hier noch einmal mit denselben Regeln geprüft wie im Browser; die
// Verträge (Jahresbeitrag plus Zugangskarte) leitet der Server aus der Wahl
// ab, statt Plan-IDs vom Client zu übernehmen.
//
// Zum Antrag gehören bis zu zwei Unterschriften: immer die des Antrags, bei
// Lastschrift die zum Mandat.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  buildSubmissionData,
  emptyRegistration,
  type RegistrationErrors,
  type RegistrationInput,
  type UploadedSignatures,
  usesDirectDebit,
  validateRegistration,
} from "@/lib/campai-registration";
import {
  buildSubmissionSchema,
  CampaiValidationError,
  createApplicationSubmission,
  fetchApplicationForm,
  uploadApplicationFile,
} from "@/lib/campai-application-submit";

export const dynamic = "force-dynamic";

/**
 * Datenpfade aus Campais Validierung → Felder im Antrag. Was Campai ablehnt,
 * landet so am richtigen Feld statt in der allgemeinen Fehlermeldung.
 */
const CAMPAI_FIELDS: Record<string, keyof RegistrationInput> = {
  firstName: "firstName",
  lastName: "lastName",
  entryAt: "entryAt",
  "address.addressLine": "street",
  "address.zip": "zip",
  "address.city": "city",
  email: "email",
  phone: "phone",
  mobilePhone: "mobilePhone",
  payerName: "accountHolder",
  "paymentMethod.sepaDirectDebit.iban": "iban",
};

/** Eine Unterschrift vom Pad wiegt wenige KB; alles darüber ist kein Strich. */
const MAX_SIGNATURE_BYTES = 512 * 1024;
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type RegistrationRequest = {
  input: RegistrationInput;
  /** Honeypot: bleibt bei Menschen leer. */
  website?: string;
};

export type RegistrationResponse =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: RegistrationErrors };

const fail = (
  status: number,
  error: string,
  fieldErrors?: RegistrationErrors,
) =>
  NextResponse.json<RegistrationResponse>(
    { ok: false, error, fieldErrors },
    { status },
  );

const decodeSignature = (value: string | null): Buffer | null => {
  if (!value?.startsWith(PNG_DATA_URL_PREFIX)) return null;
  const buffer = Buffer.from(value.slice(PNG_DATA_URL_PREFIX.length), "base64");
  const isPng = buffer.subarray(0, 8).equals(PNG_MAGIC);
  return isPng && buffer.length <= MAX_SIGNATURE_BYTES ? buffer : null;
};

/**
 * Nimmt aus dem Body nur die bekannten Felder mit dem erwarteten Typ; alles
 * andere fällt auf den leeren Antrag zurück und scheitert dann an der Prüfung.
 */
const readInput = (raw: unknown): RegistrationInput => {
  const input = emptyRegistration();
  if (!raw || typeof raw !== "object") return input;
  const source = raw as Record<string, unknown>;

  for (const key of Object.keys(input) as (keyof RegistrationInput)[]) {
    const value = source[key];
    const fallback = input[key];
    if (
      typeof value === typeof fallback ||
      // Leer heißt `null`: Unterschriften (Data-URL) und der Beitrag (Zahl).
      (fallback === null &&
        (value === null || typeof value === "string" || typeof value === "number"))
    ) {
      (input as Record<string, unknown>)[key] = value;
    }
  }

  return input;
};

export const POST = async (request: NextRequest) => {
  const body = (await request.json().catch(() => null)) as
    | RegistrationRequest
    | null;

  if (!body || typeof body.input !== "object" || body.input === null) {
    return fail(400, "Ungültige Anfrage.");
  }

  // Bots füllen jedes Feld aus. Sie bekommen dieselbe Antwort wie Menschen,
  // damit sie nicht merken, dass nichts passiert ist.
  if (body.website) {
    return NextResponse.json<RegistrationResponse>({ ok: true });
  }

  const input = readInput(body.input);
  const fieldErrors = validateRegistration(input);
  if (Object.keys(fieldErrors).length > 0) {
    return fail(422, "Bitte prüfe die markierten Felder.", fieldErrors);
  }

  // Nur die Unterschriften, die der Antrag verlangt — eine SEPA-Unterschrift,
  // die nach einem Zurück im Zustand hängen blieb, fällt weg.
  const fields: (keyof UploadedSignatures)[] = [
    "signature",
    ...(usesDirectDebit(input) ? (["sepaSignature"] as const) : []),
  ];
  const wanted = fields.map((field) => ({
    field,
    png: decodeSignature(input[field]),
  }));

  const unreadable = wanted.filter(({ png }) => !png);
  if (unreadable.length > 0) {
    return fail(
      422,
      "Bitte prüfe die markierten Felder.",
      Object.fromEntries(
        unreadable.map(({ field }) => [
          field,
          "Die Unterschrift ließ sich nicht lesen.",
        ]),
      ),
    );
  }

  try {
    const form = await fetchApplicationForm();
    const uploads = await Promise.all(
      wanted.map(async ({ field, png }) => [
        field,
        await uploadApplicationFile(form.id, png!, "signature.png", "image/png"),
      ] as const),
    );
    const signatures = Object.fromEntries(uploads) as UploadedSignatures;

    await createApplicationSubmission(
      form.id,
      {
        schema: buildSubmissionSchema(form),
        data: buildSubmissionData(input, signatures),
      },
      new URL("/registration", request.nextUrl.origin).toString(),
    );
  } catch (error) {
    console.error("[registration] Einreichung fehlgeschlagen", error);
    if (error instanceof CampaiValidationError) {
      const fieldErrors: RegistrationErrors = {};
      for (const path of Object.keys(error.validation)) {
        const field = CAMPAI_FIELDS[path];
        if (field) fieldErrors[field] = "Die Mitgliederverwaltung akzeptiert diese Angabe nicht. Bitte prüfe sie.";
      }
      if (Object.keys(fieldErrors).length > 0) {
        return fail(422, "Bitte prüfe die markierten Felder.", fieldErrors);
      }
    }
    return fail(
      502,
      "Der Antrag konnte nicht an die Mitgliederverwaltung übermittelt werden. Bitte versuche es später noch einmal.",
    );
  }

  return NextResponse.json<RegistrationResponse>({ ok: true });
};
