import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterMetadataCached } from "@/lib/bambu-cloud";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { readLastPrinterPhoto, readPrinterPhotoView } from "@/lib/printer-automation/local-state";

export const runtime = "nodejs";
export const GET = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const printerId = request.nextUrl.searchParams.get("printerId");
  if (!printerId || !(await fetchPrinterMetadataCached()).some(p => p.id === printerId)) throw new AutomationError("Drucker nicht gefunden.", 404);
  if (request.nextUrl.searchParams.get("format") === "image") {
    const photo = await readLastPrinterPhoto(printerId);
    if (!photo) throw new AutomationError("Noch kein Kamerafoto vorhanden.", 404);
    const hash = request.nextUrl.searchParams.get("v");
    if (hash && hash !== photo.sha256) throw new AutomationError("Das Kamerafoto wurde inzwischen erneuert.", 409);
    return new NextResponse(new Uint8Array(Buffer.from(photo.jpeg, "base64")), { headers: { "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" } });
  }
  return NextResponse.json({ photo: await readPrinterPhotoView(printerId) });
});
