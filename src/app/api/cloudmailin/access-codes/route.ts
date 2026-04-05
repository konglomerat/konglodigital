import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { parseCloudMailinPayload } from "@/lib/cloudmailin-access-codes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const readConfiguredToken = () => {
  const value = process.env.CLOUDMAILIN_ACCESS_CODES_TOKEN?.trim();
  if (!value) {
    throw new Error(
      "Missing CLOUDMAILIN_ACCESS_CODES_TOKEN environment variable.",
    );
  }
  return value;
};

const normalize = (value: string | null | undefined) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const tokensMatch = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
};

const resolveProvidedToken = (request: NextRequest) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const cloudMailinHeader = request.headers.get("x-cloudmailin-token")?.trim();
  if (cloudMailinHeader) {
    return cloudMailinHeader;
  }

  return request.nextUrl.searchParams.get("token")?.trim() ?? "";
};

const parseMaybeJson = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }

  return value;
};

const readPayload = async (request: NextRequest) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => null)) as unknown;
  }

  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return null;
    }

    const payload: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        payload[key] = parseMaybeJson(value);
      } else {
        payload[key] = value.name;
      }
    }
    return payload;
  }

  return (await request.json().catch(() => null)) as unknown;
};

export const POST = async (request: NextRequest) => {
  try {
    const configuredToken = readConfiguredToken();
    const providedToken = resolveProvidedToken(request);
    if (!providedToken || !tokensMatch(providedToken, configuredToken)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await readPayload(request);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid JSON payload." },
        { status: 400 },
      );
    }

    const parsed = parseCloudMailinPayload(payload, {
      accessCodePattern: process.env.CLOUDMAILIN_ACCESS_CODE_REGEX,
    });

    const allowedSender = normalize(process.env.CLOUDMAILIN_ALLOWED_FROM);
    if (allowedSender && !normalize(parsed.sender).includes(allowedSender)) {
      return NextResponse.json(
        { ok: true, ignored: "sender" },
        { status: 202 },
      );
    }

    const allowedSubject = normalize(process.env.CLOUDMAILIN_ALLOWED_SUBJECT);
    if (allowedSubject && !normalize(parsed.subject).includes(allowedSubject)) {
      return NextResponse.json(
        { ok: true, ignored: "subject" },
        { status: 202 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("access_code_inbox").insert({
      sender: parsed.sender,
      recipient: parsed.recipient,
      subject: parsed.subject,
      access_code: parsed.accessCode,
      extracted_from: parsed.extractedFrom,
      body_preview: parsed.bodyPreview,
      raw_payload: payload,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, hasCode: Boolean(parsed.accessCode) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to process webhook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
