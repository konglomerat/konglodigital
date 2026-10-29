import { NextResponse, type NextRequest } from "next/server";
import { validWorkerSecret } from "@/lib/printer-automation/auth";
import { runAutomationTick } from "@/lib/printer-automation/runner";

export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  if (!validWorkerSecret(request.headers.get("authorization"), process.env.PRINTER_AUTOMATION_WORKER_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ results: await runAutomationTick() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Druckautomatik konnte nicht geprüft werden." }, { status: 503 });
  }
}
