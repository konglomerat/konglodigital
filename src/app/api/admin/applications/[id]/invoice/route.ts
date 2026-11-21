// Die erste Rechnung als PDF — beim Entwurf Campais Vorschau, danach die
// fertige Datei.
import type { NextRequest } from "next/server";

import { getInvoice, invoicePdf } from "@/lib/membership-applications/campai";
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
    const invoiceId = application?.campai.invoiceId;
    if (!invoiceId) return errorResponse(null, "Noch keine Rechnung.", 404);
    const invoice = await getInvoice(invoiceId);
    const bytes = await invoicePdf(invoice);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(invoice.fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error, "Rechnung konnte nicht geladen werden.", 502);
  }
};
