import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createOpenAIClient } from "@/lib/openai";

const AREA_VALUES = [
  "3D-DRUCK",
  "DRUCK",
  "_BASIS",
  "BETON",
  "CNC",
  "ELEKTRO",
  "FOTO/FILM",
  "HOLZ",
  "KUSS",
  "LASER",
  "N-BIBO",
  "PRINTSHOP",
  "TEXTIL",
  "ZÜNDSTOFFE",
] as const;

const ACCOUNT_VALUES = [
  "K0004 B",
  "K0104 A",
  "BAR",
  "PAYPAL",
  "Kreditkarte",
] as const;

const normalizeArea = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  const matched = AREA_VALUES.find(
    (option) => option.toUpperCase() === normalized,
  );
  return matched;
};

const normalizeAccount = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const compact = value.trim().toLowerCase();
  const matched = ACCOUNT_VALUES.find(
    (option) => option.toLowerCase() === compact,
  );
  return matched;
};

const normalizeDate = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
};

const normalizeAmount = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const compact = value.replace(/\s/g, "").replace("€", "");
  const parsed = Number.parseFloat(compact.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type || "application/pdf"};base64,${buffer.toString("base64")}`;

  const openai = createOpenAIClient();
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    text: {
      format: {
        type: "json_schema",
        name: "buchungen_extract",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            issueDate: { type: ["string", "null"] },
            senderOrReceiver: { type: ["string", "null"] },
            receiptNumber: { type: ["string", "null"] },
            orderNumber: { type: ["string", "null"] },
            bookingText: { type: ["string", "null"] },
            bookingType: { type: ["string", "null"], enum: ["ausgabe", "einnahme", null] },
            amountEuro: { type: ["string", "null"] },
            accountCash: {
              type: ["string", "null"],
              enum: ["K0004 B", "K0104 A", "BAR", "PAYPAL", "Kreditkarte", null],
            },
            area: { type: ["string", "null"] },
            project: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            invoiceState: { type: ["string", "null"], enum: ["offen", "bezahlt", null] },
            accountOwner: { type: ["string", "null"] },
            iban: { type: ["string", "null"] },
            postens: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  amountEuro: { type: ["string", "null"] },
                },
                required: ["title", "amountEuro"],
              },
            },
          },
          required: [
            "issueDate",
            "senderOrReceiver",
            "receiptNumber",
            "orderNumber",
            "bookingText",
            "bookingType",
            "amountEuro",
            "accountCash",
            "area",
            "project",
            "notes",
            "invoiceState",
            "accountOwner",
            "iban",
            "postens",
          ],
        },
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Extrahiere aus dem hochgeladenen Rechnungs-/Belegdokument möglichst präzise Felder für ein Buchungsformular.

REGELN:
- Sprache: Deutsch
- Keine Spekulationen; unbekannte Felder als null.
- bookingType nur "ausgabe" oder "einnahme".
- amountEuro im deutschen Format mit Komma (z.B. 89,90).
- issueDate möglichst ISO (YYYY-MM-DD).
- area möglichst einer der bekannten Bereiche:
  3D-DRUCK, DRUCK, _BASIS, BETON, CNC, ELEKTRO, FOTO/FILM, HOLZ, KUSS, LASER, N-BIBO, PRINTSHOP, TEXTIL, ZÜNDSTOFFE
- postens: falls Positionen erkennbar sind, gib mehrere Einträge zurück (title + optional amountEuro).`,
          },
          {
            type: "input_file",
            filename: file.name || "invoice.pdf",
            file_data: dataUrl,
          },
        ],
      },
    ],
  });

  const outputText = response.output_text?.trim();
  if (!outputText) {
    return NextResponse.json(
      { error: "OpenAI extraction response was empty." },
      { status: 502 },
    );
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(outputText) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json(
      { error: "OpenAI extraction response was invalid." },
      { status: 502 },
    );
  }

  const postens = Array.isArray(parsed.postens)
    ? parsed.postens
        .filter((entry): entry is { title: string; amountEuro?: string | null } => {
          return (
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as { title?: unknown }).title === "string"
          );
        })
        .map((entry) => ({
          title: entry.title.trim(),
          amountEuro: normalizeAmount(entry.amountEuro ?? undefined),
        }))
        .filter((entry) => entry.title.length > 0)
    : [];

  return NextResponse.json({
    issueDate: normalizeDate(parsed.issueDate),
    senderOrReceiver:
      typeof parsed.senderOrReceiver === "string"
        ? parsed.senderOrReceiver.trim() || undefined
        : undefined,
    receiptNumber:
      typeof parsed.receiptNumber === "string"
        ? parsed.receiptNumber.trim() || undefined
        : undefined,
    orderNumber:
      typeof parsed.orderNumber === "string"
        ? parsed.orderNumber.trim() || undefined
        : undefined,
    bookingText:
      typeof parsed.bookingText === "string"
        ? parsed.bookingText.trim() || undefined
        : undefined,
    bookingType:
      parsed.bookingType === "ausgabe" || parsed.bookingType === "einnahme"
        ? parsed.bookingType
        : undefined,
    amountEuro: normalizeAmount(parsed.amountEuro),
    accountCash: normalizeAccount(parsed.accountCash),
    area: normalizeArea(parsed.area),
    project:
      typeof parsed.project === "string" ? parsed.project.trim() || undefined : undefined,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim() || undefined : undefined,
    invoiceState:
      parsed.invoiceState === "offen" || parsed.invoiceState === "bezahlt"
        ? parsed.invoiceState
        : undefined,
    accountOwner:
      typeof parsed.accountOwner === "string"
        ? parsed.accountOwner.trim() || undefined
        : undefined,
    iban: typeof parsed.iban === "string" ? parsed.iban.trim() || undefined : undefined,
    postens,
  });
};
