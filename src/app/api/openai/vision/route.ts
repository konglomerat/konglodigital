import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { createOpenAIClient } from "@/lib/openai";

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  let imageInputs: Array<{
    type: "input_image";
    image_url: string;
    detail: "auto";
  }> | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const images = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File)
      .slice(0, 3);
    if (images.length === 0) {
      const imageFile = formData.get("image") as File | null;
      if (imageFile) {
        images.push(imageFile);
      }
    }
    if (images.length === 0) {
      return NextResponse.json(
        { error: "Image is required." },
        { status: 400 },
      );
    }

    imageInputs = await Promise.all(
      images.map(async (imageFile) => {
        const arrayBuffer = await imageFile.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const dataUrl = `data:${imageFile.type || "application/octet-stream"};base64,${base64}`;
        return {
          type: "input_image" as const,
          image_url: dataUrl,
          detail: "auto" as const,
        };
      }),
    );
  } else if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      imageUrls?: string[] | null;
      imageUrl?: string | null;
    };
    const urls = Array.isArray(body.imageUrls)
      ? body.imageUrls
      : body.imageUrl
        ? [body.imageUrl]
        : [];
    const filtered = urls
      .filter((url) => typeof url === "string" && url.trim())
      .slice(0, 3);
    if (filtered.length === 0) {
      return NextResponse.json(
        { error: "Image URL is required." },
        { status: 400 },
      );
    }
    imageInputs = filtered.map((url) => ({
      type: "input_image" as const,
      image_url: url,
      detail: "auto" as const,
    }));
  } else {
    return NextResponse.json(
      { error: "Expected multipart form data or JSON payload." },
      { status: 400 },
    );
  }

  console.log("imageInputs", imageInputs.length);

  const openai = createOpenAIClient();
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    text: {
      format: {
        type: "json_schema",
        name: "resource_vision",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            title: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["description", "title", "tags"],
        },
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Du siehst ein oder mehrere Fotos für eine Inventarisierung.

AUFGABE:
1) Identifiziere den Hauptgegenstand (dominant im Bild). Ignoriere Hintergrund/Unwichtiges.
2) Erstelle einen kurzen, prägnanten Titel für genau diesen Hauptgegenstand.
3) Erstelle eine Inventar-Beschreibung als Stichpunktliste (eine Zeile pro Stichpunkt, beginnend mit "- ").
4) Erstelle passende Tags.

REGELN:
- Sprache: Deutsch.
- Keine Spekulation: Wenn etwas nicht sicher erkennbar ist, schreibe "unbekannt" statt zu raten.

INVENTAR-STICHPUNKTE (in description) – nutze diese Reihenfolge, sofern erkennbar:
- Art/Kategorie:
- Marke/Hersteller:
- Modell/Variante:
- Material:
- Farbe:
- Besonderheiten/Merkmale:
- Zubehör/Teile im Bild:
- Text/Etikett (nur wenn klar lesbar):
- Noch auf dem Bild zu sehen (z.B. Umgebung, Gegenstände):
- Synonyme:


Die Hinweise in Klammern sind nur zur Erklärung und nicht Teil der Beschreibung.

TAGS:
- 5–12 kurze Tags, kleingeschrieben, ohne #, deutsch oder gängige lehnwörter.
- Nutze auch allgemeine Kategorien (z.B. "elektronik", "werkzeug", "möbel") + spezifische Merkmale.

AUSGABE:
Antworte ausschließlich als JSON mit:
- title: string
- description: string (Stichpunktliste)
- tags: string[]`,
          },
          ...imageInputs,
        ],
      },
    ],
  });

  const outputText = response.output_text?.trim();
  if (!outputText) {
    return NextResponse.json(
      { error: "OpenAI vision response was empty." },
      { status: 502 },
    );
  }

  let payload: {
    description?: string;
    title?: string;
    tags?: string[];
  } | null = null;
  try {
    payload = JSON.parse(outputText) as {
      description?: string;
      title?: string;
      tags?: string[];
    };
  } catch {
    payload = null;
  }

  const description = payload?.description?.trim();
  const title = payload?.title?.trim();
  const tags = Array.isArray(payload?.tags)
    ? payload?.tags?.filter((tag) => typeof tag === "string")
    : null;

  if (!description || !title || !tags || tags.length === 0) {
    return NextResponse.json(
      { error: "OpenAI vision response was invalid." },
      { status: 502 },
    );
  }

  return NextResponse.json({ description, title, tags });
};
