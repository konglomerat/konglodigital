// Mitgliedsanträge — die Schritte nach der Entscheidung des Vorstands.
//
// Jeder Schritt speichert sein Ergebnis in `campai`, bevor der nächste
// beginnt. Bricht etwas ab, steht der Fehler in `lastError`, und derselbe
// Klick macht beim ersten offenen Schritt weiter — nichts wird doppelt
// angelegt.
//
// Campai, Speichern und PDF kommen als Abhängigkeiten herein; so lässt sich
// die Reihenfolge ohne Campai testen (workflow.test.ts).
import { contractPlanIds } from "@/lib/campai-registration";

import { COMPLETION_TEMPLATE_ID, WELCOME_TEMPLATE_ID } from "./config";
import type { ApplicationPatch } from "./store";
import {
  isOnboarding,
  isUndecided,
  onboardingItems,
  type ApplicationData,
  type ApplicationInvoice,
  type ChecklistStep,
  type MembershipApplication,
} from "./types";

export type WorkflowCampai = {
  createMemberContact: (data: ApplicationData) => Promise<string>;
  ensureDebtor: (contactId: string) => Promise<number>;
  readMemberNumber: (contactId: string) => Promise<string | null>;
  setMemberDetails: (contactId: string, data: ApplicationData) => Promise<void>;
  uploadFile: (bytes: Uint8Array, fileName: string, contentType: string) => Promise<string>;
  addContactDocument: (
    contactId: string,
    name: string,
    resource: string,
    fileName: string,
  ) => Promise<string>;
  createContract: (contactId: string, planId: string, startDay: string) => Promise<string>;
  collectDraft: (contactId: string) => Promise<boolean>;
  findInvoice: (debtorAccount: number, since: string) => Promise<ApplicationInvoice | null>;
  getInvoice: (invoiceId: string) => Promise<ApplicationInvoice>;
  invoicePdf: (invoice: ApplicationInvoice) => Promise<Uint8Array>;
  completeInvoice: (invoiceId: string, email: string) => Promise<ApplicationInvoice>;
  sendTemplateMessage: (
    contactId: string,
    templateId: string,
    extra?: { fileName: string; resource: string }[],
  ) => Promise<void>;
};

export type WorkflowDeps = {
  campai: WorkflowCampai;
  save: (
    current: MembershipApplication,
    patch: ApplicationPatch,
  ) => Promise<MembershipApplication>;
  applicationPdf: (
    application: MembershipApplication,
  ) => Promise<{ bytes: Uint8Array; fileName: string }>;
  now: () => string;
};

/** Ein Fehler, den die Inbox so anzeigen kann. */
export class WorkflowError extends Error {}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Unbekannter Fehler.";

/**
 * Führt `run` aus und hält einen Fehler am Antrag fest, damit er nach dem
 * Neuladen noch dasteht. Der Fehler geht danach weiter an die Route.
 */
const recordingErrors = async (
  application: MembershipApplication,
  deps: WorkflowDeps,
  run: (save: (patch: ApplicationPatch) => Promise<void>) => Promise<ApplicationPatch>,
) => {
  let current = application;
  const save = async (patch: ApplicationPatch) => {
    current = await deps.save(current, patch);
  };
  try {
    const finalPatch = await run(save);
    return await deps.save(current, { ...finalPatch, lastError: null });
  } catch (error) {
    await deps.save(current, { lastError: messageOf(error) }).catch(() => undefined);
    throw error;
  }
};

const requireContact = (application: MembershipApplication) => {
  const contactId = application.campai.contactId;
  if (!contactId) throw new WorkflowError("Der Antrag hat noch keinen Campai-Kontakt.");
  return contactId;
};

/**
 * Annehmen: Kontakt, Debitor, Beitragsfelder, Antrag als Dokument, Verträge
 * und der Rechnungsentwurf. Der Entwurf erscheint in Campai erst ~30 s
 * später — den holt syncInvoice() ab.
 */
export const acceptApplication = (
  application: MembershipApplication,
  actor: string,
  deps: WorkflowDeps,
) => {
  if (!isUndecided(application.status)) {
    throw new WorkflowError("Der Antrag ist schon entschieden.");
  }
  // ensureDebtor stellt immer Überweisung ein; ein Mandat legt es nicht an.
  if (application.data.paymentMethod === "sepaDirectDebit") {
    throw new WorkflowError(
      "Lastschrift kann konglodigital noch nicht in Campai einrichten. Bitte die Zahlungsart auf Überweisung ändern.",
    );
  }

  return recordingErrors(application, deps, async (save) => {
    let current = application;
    const step = async (patch: ApplicationPatch) => {
      await save(patch);
      current = { ...current, campai: { ...current.campai, ...patch.campai } };
    };

    if (!current.campai.contactId) {
      await step({ campai: { contactId: await deps.campai.createMemberContact(current.data) } });
    }
    const contactId = requireContact(current);

    if (!current.campai.debtorAccount) {
      const debtorAccount = await deps.campai.ensureDebtor(contactId);
      const memberNumber = await deps.campai.readMemberNumber(contactId);
      await step({ campai: { debtorAccount, ...(memberNumber ? { memberNumber } : {}) } });
    }

    // Vor den Verträgen: der Preis des Jahresbeitrags hängt an diesen Feldern.
    if (!current.campai.detailsSetAt) {
      await deps.campai.setMemberDetails(contactId, current.data);
      await step({ campai: { detailsSetAt: deps.now() } });
    }

    if (!current.campai.documentId) {
      const pdf = await deps.applicationPdf(current);
      const resource = await deps.campai.uploadFile(pdf.bytes, pdf.fileName, "application/pdf");
      const documentId = await deps.campai.addContactDocument(
        contactId,
        `Mitgliedsantrag ${current.number}`,
        resource,
        pdf.fileName,
      );
      // Die Unterschriften stehen jetzt im Dokument in Campai.
      await step({ campai: { documentId }, signatures: null });
    }

    for (const planId of contractPlanIds(current.data)) {
      if (current.campai.contracts?.[planId]) continue;
      const contractId = await deps.campai.createContract(contactId, planId, current.data.entryAt);
      await step({ campai: { contracts: { ...current.campai.contracts, [planId]: contractId } } });
    }

    if (!current.campai.collectedAt && !current.campai.noInvoiceDue) {
      const startedAt = deps.now();
      const collected = await deps.campai.collectDraft(contactId);
      await step({
        campai: collected ? { collectedAt: startedAt } : { noInvoiceDue: true },
      });
    }

    return { status: "invoice_draft", history: { by: actor, type: "accepted" } };
  });
};

/**
 * Holt den Rechnungsentwurf, sobald Campai ihn angelegt hat, und liefert die
 * Rechnung zum Anzeigen. `null`, solange es (noch) keine gibt.
 */
export const syncInvoice = async (
  application: MembershipApplication,
  deps: WorkflowDeps,
): Promise<{ application: MembershipApplication; invoice: ApplicationInvoice | null }> => {
  const { invoiceId, collectedAt, debtorAccount } = application.campai;
  if (invoiceId) {
    const invoice = await deps.campai.getInvoice(invoiceId);
    return { application: await recordPayment(application, invoice, deps), invoice };
  }
  if (application.status !== "invoice_draft" || !collectedAt || !debtorAccount) {
    return { application, invoice: null };
  }
  const invoice = await deps.campai.findInvoice(debtorAccount, collectedAt);
  if (!invoice) return { application, invoice: null };
  return {
    application: await deps.save(application, { campai: { invoiceId: invoice.id } }),
    invoice,
  };
};

/** Hakt „Überweisung eingegangen" ab, sobald Campai die Rechnung als bezahlt führt. */
const recordPayment = async (
  application: MembershipApplication,
  invoice: ApplicationInvoice,
  deps: WorkflowDeps,
) =>
  isOnboarding(application.status) &&
  !application.checklist.payment &&
  !invoice.draft &&
  invoice.paymentStatus === "paid"
    ? deps.save(application, {
        checklist: { payment: { at: invoice.paidAt ?? deps.now(), by: null } },
      })
    : application;

/**
 * Gleicht für die Liste die Zahlungen aller laufenden Aufnahmen mit Campai ab.
 * Ein Fehler bei einem Antrag lässt die anderen unberührt.
 */
export const syncPayments = (
  applications: MembershipApplication[],
  deps: WorkflowDeps,
) =>
  Promise.all(
    applications.map(async (application) => {
      const invoiceId = application.campai.invoiceId;
      if (!isOnboarding(application.status) || !invoiceId || application.checklist.payment) {
        return application;
      }
      try {
        return await recordPayment(application, await deps.campai.getInvoice(invoiceId), deps);
      } catch {
        return application;
      }
    }),
  );

/** Ein Häkchen der Aufnahme setzen oder zurücknehmen. */
export const setChecklistItem = (
  application: MembershipApplication,
  step: ChecklistStep,
  done: boolean,
  actor: string,
  deps: WorkflowDeps,
  cardNumber?: string,
) => {
  if (!isOnboarding(application.status)) {
    throw new WorkflowError("Abhaken geht nur während der Aufnahme.");
  }
  if (!onboardingItems(application).some((item) => item.key === step)) {
    throw new WorkflowError("Diesen Schritt gibt es bei diesem Antrag nicht.");
  }
  const number = cardNumber?.trim() ?? "";
  if (step === "card" && done && !number) {
    throw new WorkflowError("Bitte die Kartennummer eintragen.");
  }
  return deps.save(application, {
    checklist: {
      [step]: done
        ? { at: deps.now(), by: actor, ...(step === "card" ? { cardNumber: number } : {}) }
        : null,
    },
  });
};

/**
 * Rechnung freigeben und Willkommensmail schicken: Entwurf abschließen (ohne
 * Campai-Versand), PDF holen und mit der Vorlage „Willkommen (Teil 1/2)"
 * über Campai verschicken.
 */
export const releaseInvoice = (
  application: MembershipApplication,
  actor: string,
  deps: WorkflowDeps,
) => {
  if (application.status !== "invoice_draft") {
    throw new WorkflowError("Die Rechnung ist schon freigegeben.");
  }

  return recordingErrors(application, deps, async (save) => {
    const contactId = requireContact(application);
    const attachments: { fileName: string; resource: string }[] = [];

    if (!application.campai.noInvoiceDue) {
      const invoiceId = application.campai.invoiceId;
      if (!invoiceId) {
        throw new WorkflowError(
          "Campai legt die Rechnung noch an. Bitte in einer Minute noch einmal versuchen.",
        );
      }
      let invoice = await deps.campai.getInvoice(invoiceId);
      if (invoice.draft) {
        invoice = await deps.campai.completeInvoice(invoiceId, application.data.email);
      }
      if (!application.campai.invoiceNumber && invoice.number) {
        await save({ campai: { invoiceNumber: invoice.number } });
      }
      // Eine hochgeladene Datei taugt für genau eine Nachricht — bei jedem
      // Versuch neu hochladen.
      const resource = await deps.campai.uploadFile(
        await deps.campai.invoicePdf(invoice),
        invoice.fileName,
        "application/pdf",
      );
      attachments.push({ fileName: invoice.fileName, resource });
    }

    await deps.campai.sendTemplateMessage(contactId, WELCOME_TEMPLATE_ID, attachments);
    return {
      status: "welcomed",
      campai: { welcomeSentAt: deps.now() },
      history: { by: actor, type: "invoice_released" },
    };
  });
};

/** Alles abgehakt: Vorlage „Willkommen (Teil 2/2)", danach ist es ein Mitglied. */
export const completeMembership = (
  application: MembershipApplication,
  actor: string,
  deps: WorkflowDeps,
) => {
  if (application.status !== "welcomed") {
    throw new WorkflowError("Erst die Rechnung freigeben und die Willkommensmail schicken.");
  }
  const open = onboardingItems(application).filter((item) => !item.done);
  if (open.length > 0) {
    throw new WorkflowError(`Noch offen: ${open.map((item) => item.short).join(", ")}.`);
  }

  return recordingErrors(application, deps, async () => {
    await deps.campai.sendTemplateMessage(requireContact(application), COMPLETION_TEMPLATE_ID);
    return {
      status: "completed",
      campai: { completionSentAt: deps.now() },
      history: { by: actor, type: "completed" },
    };
  });
};
