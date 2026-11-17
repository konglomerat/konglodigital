// Mitgliedsanträge — die echten Abhängigkeiten der Schritte in workflow.ts.
import "server-only";

import { loadCampaiConfig } from "@/lib/campai-receipts/config";

import * as campai from "./campai";
import { applicationPdfFileName, createApplicationPdf } from "./pdf";
import { updateApplication } from "./store";
import type { MembershipApplication } from "./types";
import type { WorkflowDeps } from "./workflow";

export const workflowDeps: WorkflowDeps = {
  campai,
  save: updateApplication,
  applicationPdf: async (application) => ({
    bytes: await createApplicationPdf(application),
    fileName: applicationPdfFileName(application),
  }),
  now: () => new Date().toISOString(),
};

/** Das Profil in Campais Oberfläche (app.campai.com); vor dem Annehmen unter „Adressen". */
const campaiContactUrl = (contactId: string, member: boolean) => {
  const slug = process.env.CAMPAI_APP_ORGANIZATION_SLUG ?? "bnbq6";
  const { mandateId } = loadCampaiConfig();
  return `https://app.campai.com/ad/${slug}/${mandateId}/crm/contacts/${member ? "members" : "addresses"}/${encodeURIComponent(contactId)}/overview`;
};

/**
 * Hängt Namen und Profil-Link aus Campai an. Fällt Campai aus, bleibt der
 * Name aus dem Antrag stehen — der Link geht trotzdem.
 */
export const withCampaiContacts = async (
  applications: MembershipApplication[],
): Promise<MembershipApplication[]> => {
  const ids = applications.flatMap((application) =>
    application.campai.contactId ? [application.campai.contactId] : [],
  );
  if (ids.length === 0) return applications;
  const summaries = await campai
    .readContactSummaries(ids)
    .catch(() => new Map<string, { name: string; member: boolean }>());
  return applications.map((application) => {
    const contactId = application.campai.contactId;
    if (!contactId) return application;
    const summary = summaries.get(contactId);
    return {
      ...application,
      campaiContact: {
        // Vor dem Annehmen gelten Korrekturen nur hier; Campai erfährt sie erst dabei.
        name:
          (application.campai.memberAt && summary?.name) ||
          `${application.data.firstName} ${application.data.lastName}`,
        url: campaiContactUrl(contactId, summary?.member ?? Boolean(application.campai.memberAt)),
      },
    };
  });
};
