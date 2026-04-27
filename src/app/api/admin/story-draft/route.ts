import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { DEFAULT_LOCALE, normalizeLocale } from "@/i18n/config";
import { createOpenAIClient } from "@/lib/openai";
import { userCanAccessModule } from "@/lib/roles";
import {
  createFallbackStoryDraft,
  loadStorySource,
  stripMarkdown,
  truncateStoryText,
  type StoryDraftResult,
  type StoryDraftSlide,
} from "@/lib/story-drafts";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type StoryDraftRequestBody = {
  itemId?: unknown;
  locale?: unknown;
  slideCount?: unknown;
  basePrompt?: unknown;
  userInstructions?: unknown;
};

const createForbiddenResponse = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const createUnauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const toNormalizedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeSlideCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return 2;
  }
  return Math.min(Math.max(parsed, 1), 2);
};

const toSlide = (
  value: unknown,
  fallback: StoryDraftSlide,
): StoryDraftSlide => {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;

  return {
    kicker: truncateStoryText(
      toNormalizedString(record?.kicker) || fallback.kicker,
      30,
    ),
    headline: truncateStoryText(
      toNormalizedString(record?.headline) || fallback.headline,
      70,
    ),
    body: truncateStoryText(
      toNormalizedString(record?.body) || fallback.body,
      140,
    ),
  };
};

const buildPrompt = ({
  basePrompt,
  firstName,
  name,
  description,
  contentKind,
  resourceType,
  workshopName,
  tags,
  slideCount,
  userInstructions,
}: {
  basePrompt: string;
  firstName: string | null;
  name: string;
  description: string;
  contentKind: "project" | "resource";
  resourceType: string | null;
  workshopName: string | null;
  tags: string[];
  slideCount: number;
  userInstructions: string;
}) => {
  const normalizedDescription = stripMarkdown(description || "");
  const tagLine = tags.length > 0 ? tags.join(", ") : "keine";
  const infoText = [
    `Titel: ${name}`,
    `Typ: ${contentKind === "project" ? "Projekt" : "Ressource"}`,
    `Ressourcentyp: ${resourceType?.trim() || "unbekannt"}`,
    `Werkstatt: ${workshopName || "keine Angabe"}`,
    `Tags: ${tagLine}`,
    `Beschreibung: ${normalizedDescription || "keine Beschreibung vorhanden"}`,
  ].join(" | ");
  const resolvedBasePrompt = (basePrompt || "VORNAME hat mal wieder gewerkelt. INFOS ZUM PROJEKT. Schreibe witzig.")
    .replace(/VORNAME/g, firstName || "Jemand")
    .replace(/INFOS ZUM PROJEKT/g, infoText);

  return `Erstelle einen kurzen deutschen Instagram-Story-Textentwurf fuer ${slideCount} Slide${slideCount === 1 ? "" : "s"}.

REGELN:
- Sprache: Deutsch
- Ton: freundlich, nahbar, klar, gern mit Humor
- keine Emojis
- keine Hashtag-Listen
- keine erfundenen Fakten
- kurze, gut lesbare Story-Texte fuer ein Bildformat 1080x1920
- kicker sehr kurz
- headline praegnant
- body maximal 2 kurze Saetze
- wenn Details fehlen, lieber allgemein und ehrlich bleiben

KONTEXT:
- Vorlage: ${resolvedBasePrompt}

ZUSATZWUENSCHE:
${userInstructions || "Keine Zusatzwuensche."}

Gib exakt ${slideCount} Slides zurueck.`;
};

const normalizeDraft = (
  value: unknown,
  fallback: StoryDraftResult,
): StoryDraftResult => {
  const record =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  const slides = Array.isArray(record?.slides) ? record.slides : [];

  return {
    source: fallback.source,
    slides: fallback.slides.map((fallbackSlide, index) =>
      toSlide(slides[index], fallbackSlide),
    ),
  };
};

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

    const body = (await request.json().catch(() => ({}))) as StoryDraftRequestBody;
    const itemId = toNormalizedString(body.itemId);
    const locale =
      typeof body.locale === "string"
        ? normalizeLocale(body.locale)
        : DEFAULT_LOCALE;
    const slideCount = normalizeSlideCount(body.slideCount);
    const basePrompt = truncateStoryText(
      toNormalizedString(body.basePrompt),
      1000,
    );
    const userInstructions = truncateStoryText(
      toNormalizedString(body.userInstructions),
      1000,
    );

    if (!itemId) {
      return NextResponse.json(
        { error: "Waehle eine Ressource oder ein Projekt aus." },
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

    const fallbackDraft = createFallbackStoryDraft(source, slideCount);
    const warnings: string[] = [];
    if (slideCount > 1 && source.imageUrls.length < 2) {
      warnings.push(
        "Es wurde nur ein nutzbares Bild gefunden. Slide 2 verwendet dasselbe Bild erneut.",
      );
    }
    if (source.imageUrls.length === 0) {
      warnings.push(
        "Es wurde kein nutzbares Bild gefunden. Die Story wird mit einem grafischen Hintergrund gerendert.",
      );
    }

    let draft = fallbackDraft;
    let usedFallback = true;

    try {
      const openai = createOpenAIClient();
      const response = await openai.responses.create({
        model: "gpt-4.1-mini",
        text: {
          format: {
            type: "json_schema",
            name: "instagram_story_draft",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                slides: {
                  type: "array",
                  minItems: slideCount,
                  maxItems: slideCount,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      kicker: { type: "string" },
                      headline: { type: "string" },
                      body: { type: "string" },
                    },
                    required: ["kicker", "headline", "body"],
                  },
                },
              },
              required: ["slides"],
            },
          },
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Du schreibst knappe deutsche Instagram-Story-Texte fuer Konglomerat Digitale Werkstaetten.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt({
                  basePrompt,
                  firstName: source.authorFirstName,
                  name: source.name,
                  description: source.description ?? "",
                  contentKind: source.contentKind,
                  resourceType: source.resourceType,
                  workshopName: source.workshopName,
                  tags: source.tags,
                  slideCount,
                  userInstructions,
                }),
              },
            ],
          },
        ],
      });

      const outputText = response.output_text?.trim();
      if (!outputText) {
        throw new Error("OpenAI story draft response was empty.");
      }

      const parsed = JSON.parse(outputText) as unknown;
      draft = normalizeDraft(parsed, fallbackDraft);
      usedFallback = false;
    } catch {
      warnings.push(
        "OpenAI war nicht verfuegbar. Es wurde ein einfacher Standardtext erzeugt.",
      );
    }

    return NextResponse.json({
      ok: true,
      draft,
      warning: warnings.join(" ") || null,
      usedFallback,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Story-Entwurf konnte nicht erstellt werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};