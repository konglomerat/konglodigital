import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { DEFAULT_LOCALE, normalizeLocale } from "@/i18n/config";
import { createOpenAIClient } from "@/lib/openai";
import { userCanAccessModule } from "@/lib/roles";
import {
  loadStorySource,
  truncateStoryText,
  type StoryDraftSlide,
} from "@/lib/story-drafts";
import {
  createFallbackStoryLayout,
  normalizeStoryLayoutResult,
  type StoryLayoutResult,
} from "@/lib/story-layout";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type StoryLayoutRequestBody = {
  itemId?: unknown;
  locale?: unknown;
  slides?: unknown;
  layoutInstructions?: unknown;
};

const createForbiddenResponse = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const createUnauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const toNormalizedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeSlides = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as StoryDraftSlide[];
  }

  return value
    .map((entry) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as Record<string, unknown>)
          : null;

      const kicker = truncateStoryText(toNormalizedString(record?.kicker), 30);
      const headline = truncateStoryText(
        toNormalizedString(record?.headline),
        70,
      );
      const body = truncateStoryText(toNormalizedString(record?.body), 140);

      if (!headline) {
        return null;
      }

      return { kicker, headline, body } satisfies StoryDraftSlide;
    })
    .filter((entry): entry is StoryDraftSlide => Boolean(entry));
};

const buildPrompt = ({
  name,
  contentKind,
  workshopName,
  slides,
  layoutInstructions,
}: {
  name: string;
  contentKind: "project" | "resource";
  workshopName: string | null;
  slides: StoryDraftSlide[];
  layoutInstructions: string;
}) => `Erzeuge ein Layout fuer bearbeitbare Instagram-Story-Slides im Format 1080x1920.

ZIEL:
- Das Ergebnis wird spaeter in Fabric.js aufgebaut.
- Die Texte muessen gut lesbar ueber dem Bild liegen.
- Das Layout darf mutig sein, aber nicht chaotisch.
- Nutze nur diese Textrollen: kicker, headline, body.
- Rolle "headline" ist die wichtigste.
- Gib absolute Pixelwerte fuer 1080x1920 zurueck.

VISUELLE REGELN:
- maximal 1 rect-Hintergrundflaeche pro Slide
- genau die Textobjekte, die gebraucht werden
- keine ueberlappenden Textboxen
- headline nicht zu nah an den Rand
- Text darf nie ausserhalb der Leinwand landen
- kein dunkler Vollbild-Overlay ueber dem Bild
- Bild nicht abdunkeln oder transparent machen
- wenn noetig, lieber eine helle, ruhige Textflaeche im unteren Bereich nutzen
- bevorzuge klare Raender, grosszuegige Abstaende und gute Lesbarkeit

KONTEXT:
- Titel: ${name}
- Typ: ${contentKind === "project" ? "Projekt" : "Ressource"}
- Werkstatt: ${workshopName || "keine Angabe"}

SLIDES:
${slides
  .map(
    (slide, index) => `Slide ${index + 1}
- kicker: ${slide.kicker || "leer"}
- headline: ${slide.headline}
- body: ${slide.body || "leer"}`,
  )
  .join("\n")}

ZUSATZWUENSCHE:
${layoutInstructions || "Keine Zusatzwuensche."}

WICHTIG:
- Gib nur editierbare JSON-Layoutdaten zurueck.
- Kein Fliesstext, keine Erklaerungen.
- Arbeite klar, einfach und informativ.`;

export const POST = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return createUnauthorizedResponse();
    }

    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      return createForbiddenResponse();
    }

    const body = (await request.json().catch(() => ({}))) as StoryLayoutRequestBody;
    const itemId = toNormalizedString(body.itemId);
    const locale =
      typeof body.locale === "string"
        ? normalizeLocale(body.locale)
        : DEFAULT_LOCALE;
    const slides = normalizeSlides(body.slides);
    const layoutInstructions = truncateStoryText(
      toNormalizedString(body.layoutInstructions),
      1000,
    );

    if (!itemId) {
      return NextResponse.json({ error: "itemId fehlt." }, { status: 400 });
    }

    if (slides.length === 0) {
      return NextResponse.json(
        { error: "Es werden Slide-Texte fuer das Layout benoetigt." },
        { status: 400 },
      );
    }

    const source = await loadStorySource(itemId, locale);
    if (!source) {
      return NextResponse.json(
        { error: "Der ausgewaehlte Eintrag konnte nicht geladen werden." },
        { status: 404 },
      );
    }

    const fallbackLayout = createFallbackStoryLayout({ source, slides });
    const warnings: string[] = [];

    let layout: StoryLayoutResult = fallbackLayout;
    let usedFallback = true;
    let fallbackReason: string | null = null;

    try {
      const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
          slides: {
            type: "array",
            minItems: slides.length,
            maxItems: slides.length,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                backgroundColor: { type: "string" },
                overlayColor: { type: "string" },
                overlayOpacity: { type: "number" },
                objects: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      kind: {
                        type: "string",
                        enum: ["textbox", "rect"],
                      },
                      role: {
                        type: ["string", "null"],
                        enum: ["kicker", "headline", "body", null],
                      },
                      left: { type: "number" },
                      top: { type: "number" },
                      width: { type: "number" },
                      height: { type: ["number", "null"] },
                      fontSize: { type: ["number", "null"] },
                      fontWeight: { type: ["number", "null"] },
                      fill: { type: "string" },
                      textAlign: {
                        type: ["string", "null"],
                        enum: ["left", "center", "right", null],
                      },
                      backgroundColor: { type: ["string", "null"] },
                      padding: { type: ["number", "null"] },
                      opacity: { type: ["number", "null"] },
                      rx: { type: ["number", "null"] },
                      ry: { type: ["number", "null"] },
                    },
                    required: [
                      "kind",
                      "role",
                      "left",
                      "top",
                      "width",
                      "height",
                      "fontSize",
                      "fontWeight",
                      "fill",
                      "textAlign",
                      "backgroundColor",
                      "padding",
                      "opacity",
                      "rx",
                      "ry",
                    ],
                  },
                },
              },
              required: [
                "backgroundColor",
                "overlayColor",
                "overlayOpacity",
                "objects",
              ],
            },
          },
        },
        required: ["slides"],
      } as const;

      const openai = createOpenAIClient();
      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        text: {
          format: {
            type: "json_schema",
            name: "instagram_story_layout",
            schema,
          },
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Du gestaltest klare, starke, editierbare Story-Layouts fuer Fabric.js.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt({
                  name: source.name,
                  contentKind: source.contentKind,
                  workshopName: source.workshopName,
                  slides,
                  layoutInstructions,
                }),
              },
              ...source.imageUrls.slice(0, slides.length).map((imageUrl) => ({
                type: "input_image" as const,
                image_url: imageUrl,
                detail: "auto" as const,
              })),
            ],
          },
        ],
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error("OpenAI story layout response was empty.");
      }

      const parsed = JSON.parse(outputText) as unknown;

      layout = normalizeStoryLayoutResult(parsed, fallbackLayout);
      usedFallback = false;
    } catch (error) {
      fallbackReason =
        error instanceof Error ? error.message : "Unbekannter OpenAI-Fehler.";
      warnings.push(
        `OpenAI-Layout war nicht verfuegbar. Es wurde ein Standardlayout verwendet. Grund: ${fallbackReason}`,
      );
    }

    return NextResponse.json({
      ok: true,
      layout,
      warning: warnings.join(" ") || null,
      usedFallback,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Story-Layout konnte nicht erstellt werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};