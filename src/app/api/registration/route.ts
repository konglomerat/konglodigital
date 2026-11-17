// Mitgliedsantrag von /registration in die Antragsliste des Vorstands
// (membership_applications). In Campai bekommt die Person gleich einen
// Kontakt ohne Mitgliedschaft (Tag „Mitgliedsantrag"); Mitglied wird sie erst,
// wenn der Vorstand den Antrag unter Vorstand → Anträge annimmt.
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
import { receiptConfirmation } from "@/lib/membership-applications/mail-texts";
import { mailVorstandNewApplication } from "@/lib/membership-applications/mails";
import { workflowDeps } from "@/lib/membership-applications/server";
import { insertApplication } from "@/lib/membership-applications/store";
import type { ApplicationSignatures } from "@/lib/membership-applications/types";
import {
  messageApplicant,
  registerApplicant,
} from "@/lib/membership-applications/workflow";

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

  // Der Campai-Kontakt (Typ Adresse, Tag „Mitgliedsantrag") entsteht gleich,
  // wie beim Papierantrag. Fällt Campai aus, bleibt der Antrag trotzdem
  // gespeichert — den Kontakt holen Rückfrage, Annehmen oder Ablehnen nach.
  try {
    application = await registerApplicant(application, workflowDeps);
  } catch (error) {
    console.error("[registration] Campai-Kontakt nicht angelegt", error);
  }
  const registered = application;

  // Die Mails dürfen den Antrag nicht scheitern lassen — er liegt schon in
  // der Liste des Vorstands. Die Eingangsbestätigung geht über Campai an den
  // Kontakt, die Info an den Vorstand per SMTP.
  // Hinter dem Proxy ist request.nextUrl.origin localhost:3000, deshalb die
  // öffentliche Adresse aus der Umgebung.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    request.nextUrl.origin;
  const inboxUrl = new URL("/admin/vorstand/antraege", siteUrl).toString();
  after(async () => {
    const confirmation = receiptConfirmation(registered.data.firstName, registered.number);
    const results = await Promise.allSettled([
      messageApplicant(registered, confirmation.subject, confirmation.text, workflowDeps),
      mailVorstandNewApplication(registered, inboxUrl),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[registration] Mail nicht verschickt", result.reason);
      }
    }
  });

  return NextResponse.json<RegistrationResponse>({ ok: true });
};
