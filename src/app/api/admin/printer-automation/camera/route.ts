import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterMetadataCached } from "@/lib/bambu-cloud";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { capturePrinterImage } from "@/lib/printer-automation/bridge";
import { createHash } from "node:crypto";
import { checkSavedPrinterPhoto } from "@/lib/printer-automation/photo-check";
import { readPrinterPhotoView } from "@/lib/printer-automation/local-state";

export const runtime = "nodejs";
export const maxDuration = 130;
export const POST = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const printerId = request.nextUrl.searchParams.get("printerId");
  if (!printerId || !(await fetchPrinterMetadataCached()).some(p => p.id === printerId)) throw new AutomationError("Drucker nicht gefunden.", 404);
  const image = await capturePrinterImage(printerId);
  await checkSavedPrinterPhoto(printerId, createHash("sha256").update(image.jpeg).digest("hex"));
  return NextResponse.json({ photo: await readPrinterPhotoView(printerId) });
});
