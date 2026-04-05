import { createOpenAIClient } from "@/lib/openai";

export type VisionDescriptionResult = {
  description: string;
  title: string;
  tags: string[];
};

const buildImageInputsFromFiles = async (files: File[]) =>
  Promise.all(
    files.slice(0, 3).map(async (imageFile) => {
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

const buildImageInputsFromUrls = (imageUrls: string[]) =>
  imageUrls.slice(0, 3).map((url) => ({
    type: "input_image" as const,
    image_url: url,
    detail: "auto" as const,
  }));

export const describeInventoryImages = async (params: {
  files?: File[];
  imageUrls?: string[] | null;
}): Promise<VisionDescriptionResult> => {
  const files = (params.files ?? []).slice(0, 3);
  const imageUrls = (params.imageUrls ?? [])
    .filter((url) => typeof url === "string" && url.trim())
    .map((url) => url.trim())
    .slice(0, 3);

  if (files.length === 0 && imageUrls.length === 0) {
    throw new Error("No images provided for vision.");
  }

  const imageInputs =
    files.length > 0
      ? await buildImageInputsFromFiles(files)
      : buildImageInputsFromUrls(imageUrls);

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
    throw new Error("OpenAI vision response was empty.");
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
    ? payload.tags.filter((tag) => typeof tag === "string")
    : null;

  if (!description || !title || !tags || tags.length === 0) {
    throw new Error("OpenAI vision response was invalid.");
  }

  return { description, title, tags };
};