import { NextResponse, type NextRequest } from "next/server";
import { fetchPrinterHistory, fetchPrinterHistoryJob, fetchPrinterMetadataCached } from "@/lib/bambu-cloud";
import { adminAutomationRequest, AutomationError } from "@/lib/printer-automation/auth";
import { clearHistoryDraft, readHistoryDraft, saveHistoryDraft } from "@/lib/printer-automation/local-state";
import { readLimitedBody } from "@/lib/printer-automation/templates";

export const runtime = "nodejs";
export const GET = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const printerId = request.nextUrl.searchParams.get("printerId");
  const offset = Number(request.nextUrl.searchParams.get("offset") || 0);
  if (!printerId || !(await fetchPrinterMetadataCached()).some(p => p.id === printerId)) throw new AutomationError("Drucker nicht gefunden.", 404);
  if (!Number.isInteger(offset) || offset < 0 || offset > 100_000) throw new AutomationError("Ungültige Historienseite.");
  const [history, selection] = await Promise.allSettled([fetchPrinterHistory(printerId, offset), readHistoryDraft(printerId)]);
  return NextResponse.json({ jobs: history.status === "fulfilled" ? history.value.jobs : [],
    nextOffset: history.status === "fulfilled" ? history.value.nextOffset : null,
    selection: selection.status === "fulfilled" ? selection.value : null,
    historyError: history.status === "fulfilled" ? null : "Druckhistorie momentan nicht erreichbar.",
    selectionError: selection.status === "fulfilled" ? null : "Gespeicherte Auswahl konnte nicht geladen werden." });
});

export const POST = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const { printerId, taskId } = JSON.parse((await readLimitedBody(request.body, 4096)).toString());
  if (typeof printerId !== "string" || typeof taskId !== "string") throw new AutomationError("Drucker und Historieneintrag fehlen.");
  if (!(await fetchPrinterMetadataCached()).some(p => p.id === printerId)) throw new AutomationError("Drucker nicht gefunden.", 404);
  const job = await fetchPrinterHistoryJob(printerId, taskId);
  if (!job) throw new AutomationError("Dieser Historieneintrag gehört nicht zu diesem Drucker.", 404);
  const selection = await saveHistoryDraft(job);
  return NextResponse.json({ selection });
});

export const DELETE = (request: NextRequest) => adminAutomationRequest(request, async () => {
  const { printerId, taskId } = JSON.parse((await readLimitedBody(request.body, 4096)).toString());
  if (typeof printerId !== "string" || typeof taskId !== "string") throw new AutomationError("Auswahl fehlt.");
  if (!(await fetchPrinterMetadataCached()).some(p => p.id === printerId)) throw new AutomationError("Drucker nicht gefunden.", 404);
  await clearHistoryDraft(printerId, taskId);
  return NextResponse.json({ ok: true });
});
