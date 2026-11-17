// Mitgliedsanträge — die Liste für Vorstand → Anträge. Beim Laden werden die
// Zahlungen laufender Aufnahmen mit Campai abgeglichen (Webhooks gibt es nicht).
//
// POST trägt einen Papierantrag ein („Neues Mitglied"): Formulardaten plus der
// unterschriebene Antrag als PDF. Der Scan geht sofort als Dokument an den
// Campai-Kontakt, bei uns bleibt nichts davon liegen. Wer den Antrag einträgt,
// hat ihn geprüft — er wird gleich angenommen und läuft dann wie ein
// Online-Antrag weiter.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { applicationPdfFileName } from "@/lib/membership-applications/pdf";
import { withCampaiContacts, workflowDeps } from "@/lib/membership-applications/server";
import {
  deleteApplication,
  insertApplication,
  listApplications,
  updateApplication,
} from "@/lib/membership-applications/store";
import { MAX_SCAN_BYTES } from "@/lib/membership-applications/types";
import {
  readApplicationData,
  validateApplicationData,
} from "@/lib/membership-applications/validate";
import {
  acceptApplication,
  applicantContact,
  syncPayments,
  WorkflowError,
} from "@/lib/membership-applications/workflow";

import { authorizeApplications, errorResponse, messageOf } from "./auth";

export const runtime = "nodejs";
// Das Annehmen spricht mehrfach mit Campai.
export const maxDuration = 120;

export const GET = async (request: NextRequest) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;
  try {
    const applications = await withCampaiContacts(
      await syncPayments(await listApplications(), workflowDeps),
    );
    // Ein frisch gespeicherter Antrag kommt mit Unterschriften zurück — die
    // braucht die Liste nicht.
    return NextResponse.json({
      applications: applications.map((application) => ({ ...application, signatures: null })),
    });
  } catch (error) {
    return errorResponse(error, "Anträge konnten nicht geladen werden.");
  }
};

const isPdf = (bytes: Uint8Array) =>
  Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";

export const POST = async (request: NextRequest) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  const rawData = form?.get("data");
  const file = form?.get("scan");
  let raw: unknown;
  try {
    raw = typeof rawData === "string" ? JSON.parse(rawData) : null;
  } catch {
    raw = null;
  }
  if (!raw) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  const data = readApplicationData(raw);
  data.email = data.email.trim().toLowerCase();
  // Das Papierformular kennt nur die Überweisung, und mit der Unterschrift
  // sind Satzung und Beitragsordnung angenommen.
  data.paymentMethod = "sepaCreditTransfer";
  data.accountHolder = "";
  data.iban = "";
  data.statutesAccepted = true;
  data.feeRulesAccepted = true;
  const fieldErrors = validateApplicationData(data);
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: "Bitte prüfe die markierten Felder.", fieldErrors },
      { status: 422 },
    );
  }

  const scan = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : null;
  if (!scan || !isPdf(scan)) {
    return NextResponse.json(
      { error: "Bitte den unterschriebenen Antrag als PDF hochladen." },
      { status: 422 },
    );
  }
  if (scan.length > MAX_SCAN_BYTES) {
    return NextResponse.json(
      { error: "Das PDF ist größer als 10 MB. Bitte kleiner scannen." },
      { status: 422 },
    );
  }

  let application;
  try {
    application = await insertApplication(data, null, auth.actor);
  } catch (error) {
    return errorResponse(error, "Antrag konnte nicht gespeichert werden.");
  }

  // Ohne Kontakt und Scan in Campai fehlt dem Antrag die Unterschrift — dann
  // lieber gar nicht speichern; das Formular hat noch alles.
  try {
    const { campai } = workflowDeps;
    const contact = await applicantContact(data, campai);
    const fileName = applicationPdfFileName(application);
    const resource = await campai.uploadFile(scan, fileName, "application/pdf");
    const documentId = await campai.addContactDocument(
      contact.contactId,
      `Mitgliedsantrag ${application.number} (Papier)`,
      resource,
      fileName,
    );
    application = await updateApplication(application, { campai: { ...contact, documentId } });
  } catch (error) {
    await deleteApplication(application.id).catch(() => undefined);
    return errorResponse(error, "Campai hat den Antrag nicht angenommen.", 502);
  }

  try {
    const accepted = await acceptApplication(application, auth.actor, workflowDeps);
    return NextResponse.json({ application: { ...accepted, signatures: null } });
  } catch (error) {
    // Der Antrag ist gespeichert und steht unter „Offen" — dort lässt sich
    // die Annahme fortsetzen.
    return NextResponse.json(
      {
        error: messageOf(error) ?? "Annehmen fehlgeschlagen.",
        application: { ...application, signatures: null },
      },
      { status: error instanceof WorkflowError ? 409 : 502 },
    );
  }
};
