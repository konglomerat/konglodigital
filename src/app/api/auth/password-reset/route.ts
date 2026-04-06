import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  createSupabaseRouteClient,
  withSupabaseCookies,
} from "@/lib/supabase/route";

const buildSupabaseErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    const message = error.message?.trim();
    if (message && message !== "{}") {
      return message;
    }
  }

  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: unknown;
      code?: unknown;
      status?: unknown;
      error_description?: unknown;
    };

    if (
      typeof maybeError.error_description === "string" &&
      maybeError.error_description.trim()
    ) {
      return maybeError.error_description.trim();
    }

    if (
      typeof maybeError.message === "string" &&
      maybeError.message.trim() &&
      maybeError.message !== "{}"
    ) {
      return maybeError.message.trim();
    }

    const parts: string[] = [];
    if (typeof maybeError.code === "string" && maybeError.code.trim()) {
      parts.push(`code=${maybeError.code.trim()}`);
    }
    if (typeof maybeError.status === "number") {
      parts.push(`status=${maybeError.status}`);
    }

    if (parts.length > 0) {
      return `Supabase reset failed (${parts.join(", ")}).`;
    }

    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  }

  return "Passwort-Reset konnte nicht gestartet werden.";
};

const isLocalhostHost = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
};

const resolvePublicBaseUrl = (request: NextRequest) => {
  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";

  const requestOrigin = request.nextUrl.origin;
  if (!configuredBaseUrl) {
    return requestOrigin;
  }

  try {
    const configuredUrl = new URL(configuredBaseUrl);
    const requestUrl = new URL(requestOrigin);

    if (
      isLocalhostHost(configuredUrl.hostname) &&
      !isLocalhostHost(requestUrl.hostname)
    ) {
      return requestOrigin;
    }

    return configuredUrl.toString();
  } catch {
    return requestOrigin;
  }
};

export const POST = async (request: NextRequest) => {
  const { supabase, response } = createSupabaseRouteClient(request);
  const { email } = (await request.json()) as {
    email?: string;
  };

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail) {
    return NextResponse.json(
      { error: "Bitte gib eine Mailadresse ein." },
      { status: 400 },
    );
  }

  const publicBaseUrl = resolvePublicBaseUrl(request);
  const redirectTo = new URL(
    "/password-reset/complete",
    publicBaseUrl,
  ).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo,
  });

  if (error) {
    const errorMessage = buildSupabaseErrorMessage(error);
    console.error("[auth/password-reset] Failed to send reset email", {
      redirectTo,
      error,
    });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }

  // Return the same result regardless of account existence to avoid leaking user data.
  return withSupabaseCookies(NextResponse.json({ ok: true }), response);
};
