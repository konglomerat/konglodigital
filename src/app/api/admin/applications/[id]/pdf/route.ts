// Der ausgefüllte Antrag als PDF — derselbe, der beim Annehmen an den
// Campai-Kontakt geht.
import type { NextRequest } from "next/server";

import { applicationPdfFileName, createApplicationPdf } from "@/lib/membership-applications/pdf";
import { getApplication } from "@/lib/membership-applications/store";

import { authorizeApplications, errorResponse } from "../../auth";

export const runtime = "nodejs";

export const GET = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;
  try {
    const application = await getApplication((await context.params).id);
    if (!application) return errorResponse(null, "Antrag nicht gefunden.", 404);
    const bytes = await createApplicationPdf(application);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(applicationPdfFileName(application))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "PDF konnte nicht erzeugt werden.");
  }
};
