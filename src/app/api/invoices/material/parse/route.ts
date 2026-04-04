import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createOpenAIClient } from "@/lib/openai";
import {
  normalizeMaterialInvoiceParseResult,
  type MaterialInvoiceParseResult,
} from "@/lib/material-invoice";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const MAX_FILE_SIZE = 12 * 1024 * 1024;

const parseMaterialInvoiceWithAI = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const openai = createOpenAIClient();

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    text: {
      format: {
        type: "json_schema",
        name: "material_invoice_split",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            supplierName: { type: "string" },
            supplierInvoiceNumber: { type: "string" },
            supplierInvoiceDate: { type: "string" },
            currency: { type: "string" },
            shippingAmountEuro: { type: "number" },
            totalAmountEuro: { type: "number" },
            issues: { type: "array", items: { type: "string" } },
            participants: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  confidence: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                  },
                  notes: { type: "string" },
                  positions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        id: { type: "string" },
                        description: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string" },
                        unitAmountEuro: { type: "number" },
                        taxRate: { type: "number", enum: [0, 7, 19] },
                        lineTotalEuro: { type: "number" },
                        sourceText: { type: "string" },
                      },
                      required: [
                        "id",
                        "description",
                        "quantity",
                        "unit",
                        "unitAmountEuro",
                        "taxRate",
                        "lineTotalEuro",
                        "sourceText",
                      ],
                    },
                  },
                },
                required: ["id", "name", "confidence", "notes", "positions"],
              },
            },
          },
          required: [
            "supplierName",
            "supplierInvoiceNumber",
            "supplierInvoiceDate",
            "currency",
            "shippingAmountEuro",
            "totalAmountEuro",
            "issues",
            "participants",
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
            text: `Analysiere die hochgeladene Lieferantenrechnung fuer Material-Sammelbestellungen.

ZIEL:
- Erkenne alle mitbestellenden Personen.
- Ordne jede Rechnungsposition genau einer Person zu, wenn die Zuordnung aus der Rechnung ableitbar ist.
- Liefere die Lieferkosten separat als shippingAmountEuro.
- Antworte nur mit JSON gemaess Schema.

REGELN:
- Sprache der Inhalte: Deutsch.
- Waehrung: Betrage in Euro als Zahl mit Punkt, z.B. 12.34.
- taxRate nur 0, 7 oder 19.
- quantity und unitAmountEuro muessen numerisch sein.
- lineTotalEuro ist der abrechenbare Gesamtbetrag der Position, normalerweise der ganz rechte Postenbetrag in der Rechnung.
- Wenn in der Rechnung sowohl Menge x Einheitspreis als auch ein rechter Zeilen-Gesamtbetrag vorkommen, dann:
  1. "lineTotalEuro" = rechter Zeilen-Gesamtbetrag
  2. "unitAmountEuro" = echter Lieferanten-Einheitspreis
  3. "quantity" = Originalmenge aus der Lieferantenrechnung
- Beispiel: "0,221 m3 x 791,00 EUR = 174,81 EUR" bedeutet "quantity=0.221", "unit='m3'", "unitAmountEuro=791.00", "lineTotalEuro=174.81".
- sourceText soll den relevanten Originalhinweis aus dem Dokument knapp wiedergeben.
- Wenn eine Zuordnung unsicher ist, trotzdem die wahrscheinlichste Person waehlen und confidence='low' setzen.
- Wenn etwas unklar ist, erklaere es in issues.
- Falls die Rechnung eingebettetes XML enthaelt, nutze bevorzugt diese strukturierten Daten.
- shippingAmountEuro soll nur die Liefer-/Versandkosten enthalten, nicht den Warenwert.
- participants darf nur Personen enthalten, fuer die mindestens eine Position erkannt wurde.`,
          },
          {
            type: "input_file",
            filename: file.name || "rechnung.pdf",
            file_data: `data:${file.type || "application/pdf"};base64,${base64}`,
          },
        ],
      },
    ],
  });

  const outputText = response.output_text?.trim();
  if (!outputText) {
    throw new Error("OpenAI response was empty.");
  }

  let payload: MaterialInvoiceParseResult | null = null;
  try {
    payload = normalizeMaterialInvoiceParseResult(JSON.parse(outputText));
  } catch {
    payload = null;
  }

  if (!payload || payload.participants.length === 0) {
    throw new Error("Die Rechnung konnte nicht in Personen und Positionen aufgeteilt werden.");
  }

  return payload;
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userCanAccessModule(supabase, data.user, "invoices"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "PDF-Datei ist erforderlich." },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Die PDF ist leer oder groesser als 12 MB." },
        { status: 400 },
      );
    }

    const parsed = await parseMaterialInvoiceWithAI(file);
    return NextResponse.json({ parsed });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Materialrechnung konnte nicht analysiert werden.",
      },
      { status: 500 },
    );
  }
};
