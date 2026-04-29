import { readFile } from "node:fs/promises";
import path from "node:path";

import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { DEFAULT_LOCALE, normalizeLocale } from "@/i18n/config";
import { userCanAccessModule } from "@/lib/roles";
import {
  loadStorySource,
  truncateStoryText,
  type StoryDraftSlide,
} from "@/lib/story-drafts";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

type StoryImageModel =
  | "gemini-3-pro-image-preview"
  | "gemini-3.1-flash-image-preview";

type StoryGeneratedImagesRequestBody = {
  itemId?: unknown;
  locale?: unknown;
  slides?: unknown;
  imageModel?: unknown;
  imageInstructions?: unknown;
};

type InlineImagePart = {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

let sampleCoverInlineImagePromise: Promise<InlineImagePart> | null = null;
let makingOfInlineImagePromise: Promise<InlineImagePart> | null = null;

const createForbiddenResponse = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const createUnauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const toNormalizedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeImageModel = (value: unknown): StoryImageModel =>
  value === "gemini-3-pro-image-preview"
    ? "gemini-3-pro-image-preview"
    : "gemini-3.1-flash-image-preview";

const getGoogleApiKey = () =>
  process.env.GOOGLE_AI_API_KEY?.trim() ||
  process.env.GOOGLE_API_KEY?.trim() ||
  process.env.OPENAI_API_KEY?.trim() ||
  "";

const loadSampleCoverInlineImage = async () => {
  if (!sampleCoverInlineImagePromise) {
    sampleCoverInlineImagePromise = readFile(
      path.join(process.cwd(), "src/app/api/admin/story-image/samplecover.png"),
    ).then((buffer) => ({
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: "image/png",
      },
    }));
  }

  return sampleCoverInlineImagePromise;
};

const loadMakingOfInlineImage = async () => {
  if (!makingOfInlineImagePromise) {
    makingOfInlineImagePromise = readFile(
      path.join(process.cwd(), "src/app/api/admin/story-image/makingof.png"),
    ).then((buffer) => ({
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: "image/png",
      },
    }));
  }

  return makingOfInlineImagePromise;
};

const loadInlineImageFromUrl = async (url: string): Promise<InlineImagePart> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Bild konnte nicht geladen werden (HTTP ${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType: response.headers.get("content-type") || "image/jpeg",
    },
  };
};

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

const buildSlidePrompt = ({
  name,
  slide,
  slideIndex,
  slideCount,
  imageInstructions,
}: {
  name: string;
  slide: StoryDraftSlide;
  slideIndex: number;
  slideCount: number;
  imageInstructions: string;
}) => `Erstelle und layoute eine Instagramstory als einzelnes Bild im Format 9:16 (1080x1920).

Kontext: Projekt des Monats.
Stil: sehr einfaches Layout, nicht hochtrabend, eher informativ.
Die erste Bildreferenz ist das Projekt-Cover. Die letzte Bildreferenz ist die Stilvorlage. Orientiere dich visuell an der Stilvorlage.
Nutze grosse Bilder.
Schreibe auf Deutsch.
Du darfst Text leicht kuerzen und optimieren, aber die Aussage soll gleich bleiben.
Keine Erklaerung ausgeben, sondern genau ein fertiges vertikales Story-Bild erzeugen.

Seite: ${slideIndex + 1} von ${slideCount}
${slideIndex === 0 ? "Die erste Seite soll vor allem nur das Ergebnis zeigen. Das Objekt oder Projekt muss dominant und gross wirken. Wenig Text, klare Hierarchie." : "Diese Seite darf etwas informativer sein, soll das Projekt aber weiterhin gross und klar zeigen."}

Inhalt:
- Projekttitel: ${name}
- Kicker: ${slide.kicker || "Projekt des Monats"}
- Headline: ${slide.headline}
- Kurzbeschreibung: ${slide.body || ""}

Zusatzhinweise:
${imageInstructions || "Keine Zusatzhinweise."}`;

const buildSecondSlidePrompt = ({
  slide,
  imageInstructions,
}: {
  slide: StoryDraftSlide;
  imageInstructions: string;
}) => `Erstelle und layoute eine Instagramstory (als Bild) Kontext: Projekt des Monats), sehr einfaches Layout (nicht hochtrabend, eher informativ). Die Story soll mehrseitig werden. Dies ist die Seite 2 (Making of). Große Bilder! Verwende als Stil die Vorlage im letzten Bild Infos (den Text kannst du kürzen und optimieren)!

BESCHREIBUNG:
${slide.body || slide.headline}

Zusatzhinweise:
${imageInstructions || "Keine Zusatzhinweise."}

Keine Erklaerung ausgeben, sondern genau ein fertiges vertikales Story-Bild erzeugen.`;

const extractGeneratedImagePart = (result: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>) => {
  const parts = result.candidates?.[0]?.content?.parts ?? [];
  const imagePart = (parts as unknown[]).find((part) => {
    if (typeof part !== "object" || part === null) {
      return false;
    }

    const inlineData = (part as { inlineData?: { data?: unknown } }).inlineData;
    return typeof inlineData?.data === "string";
  }) as { inlineData?: { data?: string; mimeType?: string } } | undefined;

  return imagePart?.inlineData ?? null;
};

export const runtime = "nodejs";

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

    const body = (await request.json().catch(() => ({}))) as StoryGeneratedImagesRequestBody;
    const itemId = toNormalizedString(body.itemId);
    const locale =
      typeof body.locale === "string"
        ? normalizeLocale(body.locale)
        : DEFAULT_LOCALE;
    const slides = normalizeSlides(body.slides);
    const imageModel = normalizeImageModel(body.imageModel);
    const imageInstructions = truncateStoryText(
      toNormalizedString(body.imageInstructions),
      2000,
    );

    if (!itemId) {
      return NextResponse.json({ error: "itemId fehlt." }, { status: 400 });
    }

    if (slides.length === 0) {
      return NextResponse.json(
        { error: "Es werden Slide-Texte fuer die Bildgenerierung benoetigt." },
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

    if (!source.imageUrls[0]) {
      return NextResponse.json(
        { error: "Fuer die Bildgenerierung wird ein Coverbild benoetigt." },
        { status: 400 },
      );
    }

    const googleApiKey = getGoogleApiKey();
    if (!googleApiKey) {
      return NextResponse.json(
        { error: "Missing Google AI API key for story image generation." },
        { status: 500 },
      );
    }

    const [sampleCoverImage, makingOfImage] = await Promise.all([
      loadSampleCoverInlineImage(),
      loadMakingOfInlineImage(),
    ]);

    const sourceImageParts = await Promise.all(
      slides.map((_, index) =>
        loadInlineImageFromUrl(source.imageUrls[index] ?? source.imageUrls[0]),
      ),
    );

    const google = new GoogleGenAI({ apiKey: googleApiKey });
    const images: Array<{
      slideNumber: number;
      fileName: string;
      dataUrl: string;
      mimeType: string;
    }> = [];

    for (const [index, slide] of slides.entries()) {
      const styleTemplate = index === 1 ? makingOfImage : sampleCoverImage;
      const prompt =
        index === 1
          ? buildSecondSlidePrompt({
              slide,
              imageInstructions,
            })
          : buildSlidePrompt({
              name: source.name,
              slide,
              slideIndex: index,
              slideCount: slides.length,
              imageInstructions,
            });

      const result = await google.models.generateContent({
        model: imageModel,
        config: {
          imageConfig: {
            aspectRatio: "9:16",
          },
        },
        contents: [
          sourceImageParts[index],
          styleTemplate,
          {
            text: `${prompt}\n\nOutput requirements: return exactly one vertical image in 9:16 aspect ratio.` ,
          },
        ],
      });

      const inlineData = extractGeneratedImagePart(result);
      if (!inlineData?.data) {
        throw new Error(`Google-Bildantwort fuer Slide ${index + 1} enthielt kein Bild.`);
      }

      const mimeType = inlineData.mimeType || "image/png";
      images.push({
        slideNumber: index + 1,
        fileName: `${source.downloadBaseName}-slide-${index + 1}.png`,
        dataUrl: `data:${mimeType};base64,${inlineData.data}`,
        mimeType,
      });
    }

    return NextResponse.json({
      ok: true,
      images,
      warning: null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Story-Bilder konnten nicht erzeugt werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};