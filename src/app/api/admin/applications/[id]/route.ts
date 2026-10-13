// Ein Mitgliedsantrag: GET mit Unterschriften und Rechnung, PATCH für
// Korrekturen, POST für Rückfrage, Annehmen, Rechnung freigeben, Abschluss
// und Ablehnen.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { INQUIRY_SUBJECT, REJECTION_SUBJECT } from "@/lib/membership-applications/mail-texts";
import { mailApplicant } from "@/lib/membership-applications/mails";
import { workflowDeps } from "@/lib/membership-applications/server";
import { getApplication, updateApplication } from "@/lib/membership-applications/store";
import {
  CHECKLIST_STEPS,
  changedFields,
  isUndecided,
  type ApplicationInvoice,
  type ChecklistStep,
  type MembershipApplication,
} from "@/lib/membership-applications/types";
import {
  readApplicationData,
  validateApplicationData,
} from "@/lib/membership-applications/validate";
import {
  acceptApplication,
  completeMembership,
  releaseInvoice,
  setChecklistItem,
  syncInvoice,
  WorkflowError,
} from "@/lib/membership-applications/workflow";

import { authorizeApplications, errorResponse, messageOf } from "../auth";

export const runtime = "nodejs";
// Annehmen und Freigeben sprechen mehrfach mit Campai.
export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

export type ApplicationDetailResponse = {
  application: MembershipApplication;
  invoice: ApplicationInvoice | null;
  invoiceError?: string;
};

const MAX_TEXT = 5000;

const load = async (context: Context) => {
  const { id } = await context.params;
  return getApplication(id);
};

const notFound = () =>
  NextResponse.json({ error: "Antrag nicht gefunden." }, { status: 404 });

/** Rechnung zum Anzeigen; ein Campai-Fehler soll den Antrag nicht verstecken. */
const withInvoice = async (
  application: MembershipApplication,
): Promise<ApplicationDetailResponse> => {
  try {
    return await syncInvoice(application, workflowDeps);
  } catch (error) {
    return {
      application,
      invoice: null,
      invoiceError: messageOf(error) ?? "Rechnung nicht abrufbar.",
    };
  }
};

/** Korrigieren, nachfragen und ablehnen gehen nur, solange in Campai nichts angelegt ist. */
const editableError = (application: MembershipApplication) => {
  if (!isUndecided(application.status)) return "Der Antrag ist schon entschieden.";
  if (application.campai.contactId) {
    return "Die Annahme hat schon begonnen. Bitte erneut „Annehmen“ klicken, um sie abzuschließen.";
  }
  return null;
};

const readText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export const GET = async (request: NextRequest, context: Context) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;
  try {
    const application = await load(context);
    if (!application) return notFound();
    return NextResponse.json(await withInvoice(application));
  } catch (error) {
    return errorResponse(error, "Antrag konnte nicht geladen werden.");
  }
};

export const PATCH = async (request: NextRequest, context: Context) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;
  try {
    const application = await load(context);
    if (!application) return notFound();
    const blocked = editableError(application);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

    const body = (await request.json().catch(() => ({}))) as { data?: unknown };
    const data = readApplicationData(body.data);
    data.email = data.email.trim().toLowerCase();
    const fieldErrors = validateApplicationData(data);
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: "Bitte prüfe die markierten Felder.", fieldErrors },
        { status: 422 },
      );
    }

    const changes = changedFields(application.data, data);
    const updated =
      changes.length === 0
        ? application
        : await updateApplication(application, {
            data,
            history: {
              by: auth.actor,
              type: "edited",
              text: changes.map((change) => change.label).join(", "),
            },
          });
    return NextResponse.json(await withInvoice(updated));
  } catch (error) {
    return errorResponse(error, "Änderung konnte nicht gespeichert werden.");
  }
};

export const POST = async (request: NextRequest, context: Context) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const application = await load(context);
    if (!application) return notFound();
    let updated: MembershipApplication;

    switch (body.action) {
      case "inquiry": {
        const blocked = editableError(application);
        if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
        const text = readText(body.text);
        if (!text || text.length > MAX_TEXT) {
          return NextResponse.json(
            { error: "Bitte eine Rückfrage schreiben (höchstens 5000 Zeichen)." },
            { status: 400 },
          );
        }
        await mailApplicant(application, INQUIRY_SUBJECT, text);
        updated = await updateApplication(application, {
          status: "inquiry",
          history: { by: auth.actor, type: "inquiry", text },
        });
        break;
      }

      case "reject": {
        const blocked = editableError(application);
        if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
        const reason = readText(body.reason);
        const mailText = readText(body.mailText);
        if (!reason || reason.length > 2000) {
          return NextResponse.json(
            { error: "Eine Ablehnung braucht einen Grund (höchstens 2000 Zeichen)." },
            { status: 400 },
          );
        }
        if (mailText.length > MAX_TEXT) {
          return NextResponse.json(
            { error: "Die Absage ist zu lang (höchstens 5000 Zeichen)." },
            { status: 400 },
          );
        }
        if (mailText) await mailApplicant(application, REJECTION_SUBJECT, mailText);
        updated = await updateApplication(application, {
          status: "rejected",
          rejectionReason: reason,
          history: {
            by: auth.actor,
            type: "rejected",
            text: mailText ? `${reason}\n\nAbsage verschickt.` : `${reason}\n\nOhne Absage-Mail.`,
          },
        });
        break;
      }

      case "check": {
        const step = body.step as ChecklistStep;
        if (!(CHECKLIST_STEPS as readonly string[]).includes(step)) {
          return NextResponse.json({ error: "Unbekannter Schritt." }, { status: 400 });
        }
        updated = await setChecklistItem(
          application,
          step,
          body.done === true,
          auth.actor,
          workflowDeps,
          readText(body.cardNumber).slice(0, 40),
        );
        break;
      }

      case "accept":
        updated = await acceptApplication(application, auth.actor, workflowDeps);
        break;

      case "release":
        updated = await releaseInvoice(application, auth.actor, workflowDeps);
        break;

      case "complete":
        updated = await completeMembership(application, auth.actor, workflowDeps);
        break;

      default:
        return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
    }

    return NextResponse.json(await withInvoice(updated));
  } catch (error) {
    // Den gespeicherten Fehler und den Stand danach mitschicken, damit die
    // Inbox beides zeigt.
    const application = await load(context).catch(() => null);
    return NextResponse.json(
      {
        error: messageOf(error) ?? "Aktion fehlgeschlagen.",
        ...(application ? await withInvoice(application) : {}),
      },
      { status: error instanceof WorkflowError ? 409 : 502 },
    );
  }
};
