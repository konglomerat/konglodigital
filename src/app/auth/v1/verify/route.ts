import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const GET = async (request: NextRequest) => {
  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const supabaseOrigin = new URL(supabaseUrl).origin;
    const publicBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      "";
    const linkType = request.nextUrl.searchParams.get("type") ?? "";
    const inviteFallbackRedirect = publicBaseUrl
      ? new URL("/register/complete", publicBaseUrl).toString()
      : "";
    const target = new URL(`${supabaseUrl}/auth/v1/verify`);
    let hasRedirectTo = false;

    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      if (key === "redirect_to" && publicBaseUrl) {
        hasRedirectTo = true;
        try {
          const redirectToUrl = new URL(value);
          if (linkType === "invite" && redirectToUrl.origin === supabaseOrigin) {
            target.searchParams.append(key, inviteFallbackRedirect || value);
            continue;
          }

          if (redirectToUrl.origin === supabaseOrigin) {
            const publicOrigin = new URL(publicBaseUrl);
            redirectToUrl.protocol = publicOrigin.protocol;
            redirectToUrl.host = publicOrigin.host;
            target.searchParams.append(key, redirectToUrl.toString());
            continue;
          }
        } catch {
          // Keep original redirect value when parsing fails.
        }
      }

      target.searchParams.append(key, value);
    }

    if (!hasRedirectTo && linkType === "invite" && inviteFallbackRedirect) {
      target.searchParams.append("redirect_to", inviteFallbackRedirect);
    }

    return NextResponse.redirect(target, { status: 302 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Supabase verify URL could not be resolved.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
