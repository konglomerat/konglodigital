import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterMetadataCached } from "@/lib/bambu-cloud";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { inspectPrintFile, readLimitedBody } from "@/lib/printer-automation/templates";
import { MAX_TEMPLATE_BYTES } from "@/lib/printer-automation/types";
import { savePrintTemplate } from "@/lib/printer-automation/save-template";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (request: NextRequest) => adminAutomationRequest(request, async userId => {
  const params = request.nextUrl.searchParams;
  const printerId = params.get("printerId");
  const name = params.get("name")?.trim();
  const fileName = params.get("fileName")?.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200);
  const plate = Number(params.get("plate"));
  const useAms = params.get("useAms") === "true";
  const mappingText = params.get("amsMapping")?.trim() ?? "";
  const amsMapping = mappingText ? mappingText.split(",").map(Number) : [];
  if (!name || name.length > 120 || !fileName || !printerId || (mappingText && !/^-?\d+(,-?\d+)*$/.test(mappingText)) || amsMapping.length > 16
    || amsMapping.some(v => !Number.isInteger(v) || v < -1 || v > 255) || (useAms && !amsMapping.length)) {
    throw new AutomationError("Name, Druckdatei oder AMS-Zuordnung fehlen oder sind ungültig.");
  }
  const printer = (await fetchPrinterMetadataCached()).find(p => p.id === printerId);
  if (!printer) throw new AutomationError("Drucker nicht gefunden.", 404);
  const bytes = await readLimitedBody(request.body, MAX_TEMPLATE_BYTES);
  const metadata = inspectPrintFile(bytes, fileName, printer.model, plate);
  const id = await savePrintTemplate(bytes, { printer_id: printerId, name,
    file_name: fileName, ...metadata, use_ams: useAms, ams_mapping: useAms ? amsMapping : [], created_by: userId });
  return NextResponse.json({ id }, { status: 201 });
});
