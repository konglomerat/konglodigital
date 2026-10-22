// Anfrage für einen Gruppen-Workshop (Schule, Verein, Firma). Geht als Mail
// an das Workshop-Team; Antworten landen direkt bei der anfragenden Person.
import { NextResponse, type NextRequest } from "next/server";

import { getGroupWorkshop } from "@/lib/group-workshops";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { SmtpConfigurationError, sendSmtpMail } from "@/lib/smtp-mail";
import { WORKSHOP_REQUEST_EMAIL } from "@/lib/workshops";

const text = (value: unknown, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const POST = async (request: NextRequest) => {
  // Workshops sind noch „Coming Soon“ und nur angemeldet erreichbar.
  const { supabase } = createSupabaseRouteClient(request);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json(
      { error: "Bitte melde dich an, um anzufragen." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  // Honeypot: Menschen sehen das Feld nicht, Bots füllen es aus.
  if (text(body.website)) return NextResponse.json({ success: true });

  // Kommt die Anfrage von einer Detailseite, gilt der Titel aus unseren Daten,
  // nicht der vom Browser gesendete.
  const workshopSlug = text(body.workshopSlug, 120);
  const knownWorkshop = workshopSlug ? await getGroupWorkshop(workshopSlug) : null;
  if (workshopSlug && !knownWorkshop) {
    return NextResponse.json({ error: "Unbekannter Workshop." }, { status: 400 });
  }

  const request_ = {
    orgType: text(body.orgType, 40),
    contactName: text(body.contactName, 120),
    organisation: text(body.organisation, 160),
    email: text(body.email, 160),
    phone: text(body.phone, 40),
    workshop: knownWorkshop?.title ?? text(body.workshop, 160),
    people: Math.max(1, Math.min(200, Math.trunc(Number(body.people) || 0))),
    audience: text(body.audience, 160),
    period: text(body.period, 160),
    message: text(body.message, 800),
  };

  if (!request_.contactName || !request_.organisation) {
    return NextResponse.json(
      { error: "Bitte gib Ansprechperson und Organisation an." },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request_.email)) {
    return NextResponse.json(
      { error: "Bitte gib eine gültige E-Mail-Adresse an." },
      { status: 400 },
    );
  }
  if (body.privacy !== true) {
    return NextResponse.json(
      { error: "Bitte bestätige die Datenschutzhinweise." },
      { status: 400 },
    );
  }

  const rows: Array<[string, string]> = [
    ["Art", request_.orgType],
    ["Organisation", request_.organisation],
    ["Ansprechperson", request_.contactName],
    ["E-Mail", request_.email],
    ["Telefon", request_.phone],
    ["Workshop", request_.workshop || "noch offen"],
    ["Teilnehmende", String(request_.people)],
    ["Zielgruppe", request_.audience],
    ["Wunschzeitraum", request_.period],
  ];
  const filled = rows.filter(([, value]) => value);
  const plain = [
    `Neue Workshop-Anfrage über konglodigital`,
    "",
    ...filled.map(([label, value]) => `${label}: ${value}`),
    "",
    request_.message ? `Was habt ihr vor?\n${request_.message}` : "",
  ].join("\n");
  const html = [
    `<p>Neue Workshop-Anfrage über konglodigital</p>`,
    `<table cellpadding="4">${filled
      .map(
        ([label, value]) =>
          `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`,
      )
      .join("")}</table>`,
    request_.message
      ? `<p><strong>Was habt ihr vor?</strong><br>${escapeHtml(request_.message).replaceAll("\n", "<br>")}</p>`
      : "",
  ].join("\n");

  try {
    await sendSmtpMail({
      to: WORKSHOP_REQUEST_EMAIL,
      subject: request_.workshop
        ? `Workshop-Anfrage: ${request_.workshop} – ${request_.organisation}`
        : `Workshop-Anfrage: ${request_.organisation}`,
      text: plain,
      html,
      replyTo: request_.email,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[workshops] request mail failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof SmtpConfigurationError
            ? `Das Formular ist gerade nicht erreichbar. Schreib uns bitte direkt an ${WORKSHOP_REQUEST_EMAIL}.`
            : `Die Anfrage ist nicht angekommen. Versuch es noch einmal oder schreib an ${WORKSHOP_REQUEST_EMAIL}.`,
      },
      { status: 503 },
    );
  }
};
