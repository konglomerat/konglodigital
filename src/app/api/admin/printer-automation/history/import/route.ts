import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterMetadataCached } from "@/lib/bambu-cloud";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { readHistoryDraft, readHistoryDraftFile } from "@/lib/printer-automation/local-state";
import { inspectPrintFile, readLimitedBody } from "@/lib/printer-automation/templates";
import { savePrintTemplate } from "@/lib/printer-automation/save-template";

export const runtime = "nodejs";
export const POST = (request: NextRequest) => adminAutomationRequest(request, async userId => {
  const { printerId, taskId, fileId } = JSON.parse((await readLimitedBody(request.body, 4096)).toString());
  if (typeof printerId !== "string" || typeof taskId !== "string" || typeof fileId !== "string") throw new AutomationError("Auswahl fehlt.");
  const printer = (await fetchPrinterMetadataCached()).find(p => p.id === printerId);
  if (!printer) throw new AutomationError("Drucker nicht gefunden.", 404);
  const draft = await readHistoryDraft(printerId);
  if (!draft?.file || draft.job.id !== taskId || draft.file.id !== fileId) throw new AutomationError("Auswahl oder Datei wurde geändert. Bitte neu laden.", 409);
  const bytes = await readHistoryDraftFile(draft.file);
  const metadata = inspectPrintFile(bytes, draft.file.fileName, printer.model, draft.file.plate);
  const id = await savePrintTemplate(bytes, { printer_id: printerId, name: draft.job.title.slice(0, 120),
    file_name: draft.file.fileName, ...metadata, use_ams: draft.file.useAms, ams_mapping: draft.file.amsMapping, created_by: userId });
  return NextResponse.json({ id }, { status: 201 });
});
