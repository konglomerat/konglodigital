import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterMetadataCached } from "@/lib/bambu-cloud";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { attachHistoryDraftFile, readHistoryDraft } from "@/lib/printer-automation/local-state";
import { inspectPrintFile, readLimitedBody } from "@/lib/printer-automation/templates";
import { MAX_TEMPLATE_BYTES } from "@/lib/printer-automation/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const params = request.nextUrl.searchParams;
  const printerId = params.get("printerId");
  const taskId = params.get("taskId");
  const fileName = params.get("fileName")?.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200);
  const plate = Number(params.get("plate"));
  const useAms = params.get("useAms") === "true";
  const text = params.get("amsMapping")?.trim() ?? "";
  const amsMapping = text ? text.split(",").map(Number) : [];
  if (!printerId || !taskId || !fileName || (text && !/^-?\d+(,-?\d+)*$/.test(text)) || amsMapping.length > 16
    || amsMapping.some(v => !Number.isInteger(v) || v < -1 || v > 255) || (useAms && !amsMapping.length)) {
    throw new AutomationError("Druckdatei oder AMS-Zuordnung fehlen oder sind ungültig.");
  }
  const printer = (await fetchPrinterMetadataCached()).find(p => p.id === printerId);
  if (!printer) throw new AutomationError("Drucker nicht gefunden.", 404);
  const draft = await readHistoryDraft(printerId);
  if (!draft || draft.job.id !== taskId) throw new AutomationError("Die Historienauswahl wurde geändert. Bitte neu laden.", 409);
  const bytes = await readLimitedBody(request.body, MAX_TEMPLATE_BYTES);
  const metadata = inspectPrintFile(bytes, fileName, printer.model, plate);
  const selection = await attachHistoryDraftFile(printerId, taskId, bytes, { ...metadata, fileName, useAms, amsMapping: useAms ? amsMapping : [] });
  return NextResponse.json({ selection }, { status: 201 });
});
