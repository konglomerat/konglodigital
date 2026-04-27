import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { DEFAULT_LOCALE, normalizeLocale } from "@/i18n/config";
import { userCanAccessModule } from "@/lib/roles";
import {
  getStorySlideImageUrl,
  loadStorySource,
  truncateStoryText,
} from "@/lib/story-drafts";
import { createStoryImageMarkup } from "@/lib/story-image";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const createForbiddenResponse = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const createUnauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const toNormalizedString = (value: string | null) => value?.trim() ?? "";

const normalizeSlideNumber = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return 1;
  }
  return Math.min(Math.max(parsed, 1), 2);
};

const normalizeBooleanFlag = (value: string | null) =>
  value !== "0" && value?.toLowerCase() !== "false";

export const GET = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return createUnauthorizedResponse();
    }

    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      return createForbiddenResponse();
    }

    const searchParams = request.nextUrl.searchParams;
    const itemId = toNormalizedString(searchParams.get("itemId"));
    const locale = normalizeLocale(
      toNormalizedString(searchParams.get("locale")) || DEFAULT_LOCALE,
    );
    const slideNumber = normalizeSlideNumber(searchParams.get("slide"));
    const showTextOverlay = normalizeBooleanFlag(
      searchParams.get("showTextOverlay"),
    );

    if (!itemId) {
      return NextResponse.json(
        { error: "itemId fehlt." },
        { status: 400 },
      );
    }

    const source = await loadStorySource(itemId, locale);
    if (!source) {
      return NextResponse.json(
        { error: "Eintrag nicht gefunden." },
        { status: 404 },
      );
    }

    const imageUrl = getStorySlideImageUrl(source, slideNumber - 1);
    const kicker = truncateStoryText(
      toNormalizedString(searchParams.get("kicker")),
      30,
    );
    const headline = truncateStoryText(
      toNormalizedString(searchParams.get("headline")),
      70,
    );
    const body = truncateStoryText(
      toNormalizedString(searchParams.get("body")),
      140,
    );

    const response = new ImageResponse(
      createStoryImageMarkup({
        imageUrl,
        showTextOverlay,
        kicker,
        headline,
        body,
      }),
      {
        width: 1080,
        height: 1920,
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );

    response.headers.set(
      "Content-Disposition",
      `inline; filename=\"${source.downloadBaseName}-slide-${slideNumber}.png\"`,
    );

    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Story-Bild konnte nicht erzeugt werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};