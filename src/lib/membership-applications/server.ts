// Mitgliedsanträge — die echten Abhängigkeiten der Schritte in workflow.ts.
import "server-only";

import * as campai from "./campai";
import { applicationPdfFileName, createApplicationPdf } from "./pdf";
import { updateApplication } from "./store";
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
