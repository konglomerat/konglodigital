import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import ExifReader from "exifreader";

type ExifData = Record<string, string>;

type ExifResponse = {
  data: Record<string, ExifData | null>;
  skipped: string[];
};

const getAllowedHosts = () => {
  const hosts = new Set<string>();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (supabaseUrl) {
    try {
      hosts.add(new URL(supabaseUrl).host);
    } catch {
      // ignore
    }
  }
  return hosts;
};

const isAllowedUrl = (value: string, allowedHosts: Set<string>) => {
  try {
    const url = new URL(value);
    if (!allowedHosts.has(url.host)) {
      return false;
    }
    return url.pathname.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
};

const formatExifValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "object" && entry && "description" in entry
          ? String((entry as { description: string }).description)
          : String(entry),
      )
      .join(", ");
  }
  if (value && typeof value === "object") {
    if ("description" in value) {
      return String((value as { description: string }).description);
    }
    if ("value" in value) {
      return String((value as { value: unknown }).value);
    }
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const toExifData = (tags: Record<string, unknown>) =>
  Object.entries(tags).reduce<ExifData>((acc, [key, tag]) => {
    const value = formatExifValue(
      (tag as { description?: unknown; value?: unknown })?.description ??
        (tag as { value?: unknown })?.value,
    );
    if (value) {
      acc[key] = value;
    }
    return acc;
  }, {});

export const POST = async (request: NextRequest) => {
  const allowedHosts = getAllowedHosts();
  if (allowedHosts.size === 0) {
    return NextResponse.json(
      { error: "EXIF lookup not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as { urls?: unknown };
  const urls = Array.isArray(body.urls)
    ? body.urls.filter((value): value is string => typeof value === "string")
    : [];

  const limitedUrls = urls.slice(0, 20);
  const skipped: string[] = [];
  const entries = await Promise.all(
    limitedUrls.map(async (imageUrl) => {
      if (!isAllowedUrl(imageUrl, allowedHosts)) {
        skipped.push(imageUrl);
        return [imageUrl, null] as const;
      }
      try {
        const response = await fetch(imageUrl, { cache: "no-store" });
        const buffer = await response.arrayBuffer();
        const tags = ExifReader.load(buffer, {
          excludeTags: { xmp: true },
        });
        return [imageUrl, toExifData(tags)] as const;
      } catch {
        return [imageUrl, null] as const;
      }
    }),
  );

  const data = Object.fromEntries(entries);
  const payload: ExifResponse = { data, skipped };
  return NextResponse.json(payload);
};
