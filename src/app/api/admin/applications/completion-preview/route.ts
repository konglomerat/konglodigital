// Vorschau der Campai-Vorlage „Willkommen (Teil 2/2)" — öffnet als eigene Seite.
// `?karte=nein` zeigt die Fassung für Mitglieder ohne Zugangskarte.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { previewTemplate } from "@/lib/membership-applications/campai";
import {
  COMPLETION_NO_CARD_TEMPLATE_ID,
  COMPLETION_TEMPLATE_ID,
} from "@/lib/membership-applications/config";

import { authorizeApplications, errorResponse } from "../auth";

export const runtime = "nodejs";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[char]};`);

export const GET = async (request: NextRequest) => {
  const auth = await authorizeApplications(request);
  if ("response" in auth) return auth.response;
  try {
    const withoutCard = request.nextUrl.searchParams.get("karte") === "nein";
    const { subject, html } = await previewTemplate(
      withoutCard ? COMPLETION_NO_CARD_TEMPLATE_ID : COMPLETION_TEMPLATE_ID,
    );
    // Betreff über der Mail; Campais HTML bleibt unverändert darunter.
    const page = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Vorschau: ${escapeHtml(subject)}</title></head><body style="margin:0;background:#f4f4f5"><div style="max-width:800px;margin:0 auto;padding:16px;font:16px/1.4 system-ui,sans-serif"><p style="margin:0 0 4px;color:#71717a">Vorschau · Platzhalter werden beim Senden ersetzt</p><p style="margin:0 0 16px"><strong>Betreff:</strong> ${escapeHtml(subject)}</p><div style="background:#fff">${html}</div></div></body></html>`;
    return new NextResponse(page, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "Vorschau nicht abrufbar.", 502);
  }
};
