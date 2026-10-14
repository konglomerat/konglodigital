// Mitgliedsanträge — die Liste für Vorstand → Anträge. Beim Laden werden die
// Zahlungen laufender Aufnahmen mit Campai abgeglichen (Webhooks gibt es nicht).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { workflowDeps } from "@/lib/membership-applications/server";
import { listApplications } from "@/lib/membership-applications/store";
import { syncPayments } from "@/lib/membership-applications/workflow";

import { authorizeApplications, errorResponse } from "./auth";

export const runtime = "nodejs";

export const GET = async (request: NextRequest) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;
  try {
    const applications = await syncPayments(await listApplications(), workflowDeps);
    // Ein frisch gespeicherter Antrag kommt mit Unterschriften zurück — die
    // braucht die Liste nicht.
    return NextResponse.json({
      applications: applications.map((application) => ({ ...application, signatures: null })),
    });
  } catch (error) {
    return errorResponse(error, "Anträge konnten nicht geladen werden.");
  }
};
