import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterMetadataCached } from "@/lib/bambu-cloud";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { checkSavedPrinterPhoto } from "@/lib/printer-automation/photo-check";

export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const printerId = request.nextUrl.searchParams.get("printerId");
  const hash = request.nextUrl.searchParams.get("hash") ?? "";
  if (!printerId || !(await fetchPrinterMetadataCached()).some(p => p.id === printerId)) throw new AutomationError("Drucker nicht gefunden.", 404);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new AutomationError("Ungültiges Kamerafoto.");
  return NextResponse.json({ check: await checkSavedPrinterPhoto(printerId, hash) });
});
