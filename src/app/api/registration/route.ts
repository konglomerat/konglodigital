// Mitgliedsantrag von /registration in die Antragsliste des Vorstands
// (membership_applications). In Campai entsteht das Mitglied erst, wenn der
// Vorstand den Antrag unter Vorstand → Anträge annimmt.
//
// Öffentlich — wer einen Antrag stellt, hat noch kein Konto. Die Eingaben
// werden hier noch einmal mit denselben Regeln geprüft wie im Browser; die
// Verträge (Jahresbeitrag plus Zugangskarte) leitet der Server beim Annehmen
// aus der Wahl ab, statt Plan-IDs vom Client zu übernehmen.
//
// Zum Antrag gehören bis zu zwei Unterschriften: immer die des Antrags, bei
// Lastschrift die zum Mandat.
import { after, NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  readRegistrationInput,
  type RegistrationErrors,
  type RegistrationInput,
  usesDirectDebit,
  validateRegistration,
} from "@/lib/campai-registration";
import {
  mailReceiptConfirmation,
  mailVorstandNewApplication,
} from "@/lib/membership-applications/mails";
import { insertApplication } from "@/lib/membership-applications/store";
import type { ApplicationSignatures } from "@/lib/membership-applications/types";

export const dynamic = "force-dynamic";

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

const isReadablePng = (value: string | null) => {
  if (!value?.startsWith(PNG_DATA_URL_PREFIX)) return false;
  const buffer = Buffer.from(value.slice(PNG_DATA_URL_PREFIX.length), "base64");
  return buffer.subarray(0, 8).equals(PNG_MAGIC) && buffer.length <= MAX_SIGNATURE_BYTES;
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

  const input = readRegistrationInput(body.input);
  const fieldErrors = validateRegistration(input);
  if (Object.keys(fieldErrors).length > 0) {
    return fail(422, "Bitte prüfe die markierten Felder.", fieldErrors);
  }

  // Nur die Unterschriften, die der Antrag verlangt — eine SEPA-Unterschrift,
  // die nach einem Zurück im Zustand hängen blieb, fällt weg.
  const directDebit = usesDirectDebit(input);
  const unreadable = (
    ["signature", ...(directDebit ? (["sepaSignature"] as const) : [])] as const
  ).filter((field) => !isReadablePng(input[field]));
  if (unreadable.length > 0) {
    return fail(
      422,
      "Bitte prüfe die markierten Felder.",
      Object.fromEntries(
        unreadable.map((field) => [field, "Die Unterschrift ließ sich nicht lesen."]),
      ),
    );
  }

  const { signature, sepaSignature, ...data } = input;
  const signatures: ApplicationSignatures = {
    signature: signature!,
    ...(directDebit && sepaSignature ? { sepaSignature } : {}),
  };

  let application;
  try {
    application = await insertApplication(
      { ...data, email: data.email.trim().toLowerCase() },
      signatures,
    );
  } catch (error) {
    console.error("[registration] Antrag nicht gespeichert", error);
    return fail(
      502,
      "Der Antrag konnte nicht gespeichert werden. Bitte versuche es später noch einmal.",
    );
  }

  // Die Mails dürfen den Antrag nicht scheitern lassen — er liegt schon in
  // der Liste des Vorstands.
  const inboxUrl = new URL("/admin/vorstand/antraege", request.nextUrl.origin).toString();
  after(async () => {
    const results = await Promise.allSettled([
      mailReceiptConfirmation(application),
      mailVorstandNewApplication(application, inboxUrl),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[registration] Mail nicht verschickt", result.reason);
      }
    }
  });

  return NextResponse.json<RegistrationResponse>({ ok: true });
};
