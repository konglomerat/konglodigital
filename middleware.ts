import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  DEFAULT_LOCALE,
  ENGLISH_LOCALE,
  LOCALE_COOKIE_NAME,
  LOCALE_HEADER_NAME,
  localizePathname,
  stripLocalePrefix,
} from "@/i18n/config";

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const protectedPagePrefixes = [
  "/account",
  "/admin",
  "/monatsbeitrag",
  "/resources",
  "/invoices",
  "/reimbursement",
  "/eigenbeleg",
  "/buchungen",
  "/budget",
];

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const requiresAuthentication = (pathname: string) => {
  return protectedPagePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};

const isPublicPath = (pathname: string) => {
  const looksLikeStaticAsset = /\.[a-z0-9]+$/i.test(pathname);

  return (
    looksLikeStaticAsset ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/password-reset") ||
    pathname.startsWith("/auth") ||
    pathname === "/favicon.ico"
  );
};

const shouldBypassLocaleHandling = (pathname: string) => {
  const looksLikeStaticAsset = /\.[a-z0-9]+$/i.test(pathname);

  return (
    looksLikeStaticAsset ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  );
};

const buildLocaleSegmentPath = (pathname: string, locale: "de" | "en") => {
  if (pathname === "/") {
    return `/${locale}`;
  }

  return `/${locale}${pathname}`;
};

const createLocalizedResponse = (
  request: NextRequest,
  internalPathname: string,
  locale: "de" | "en",
) => {
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER_NAME, locale);

  const shouldRewrite = internalPathname !== request.nextUrl.pathname;
  const rewrittenUrl = request.nextUrl.clone();
  rewrittenUrl.pathname = internalPathname;

  const response = shouldRewrite
    ? NextResponse.rewrite(rewrittenUrl, {
        request: {
          headers,
        },
      })
    : NextResponse.next({
        request: {
          headers,
        },
      });

  response.cookies.set({
    name: LOCALE_COOKIE_NAME,
    value: locale,
    path: "/",
    sameSite: "lax",
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  });

  return response;
};

export async function middleware(request: NextRequest) {
  const { pathname: pathnameWithoutLocalePrefix, localeFromPath } =
    stripLocalePrefix(request.nextUrl.pathname);
  const locale = localeFromPath ?? DEFAULT_LOCALE;

  if (shouldBypassLocaleHandling(pathnameWithoutLocalePrefix)) {
    if (localeFromPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = pathnameWithoutLocalePrefix;
      return NextResponse.redirect(redirectUrl);
    }

    return NextResponse.next();
  }

  if (localeFromPath === DEFAULT_LOCALE) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = pathnameWithoutLocalePrefix;
    return NextResponse.redirect(redirectUrl);
  }

  const internalPathname = localeFromPath
    ? request.nextUrl.pathname
    : pathnameWithoutLocalePrefix === "/"
      ? "/"
      : buildLocaleSegmentPath(pathnameWithoutLocalePrefix, DEFAULT_LOCALE);

  const response = createLocalizedResponse(
    request,
    internalPathname,
    locale,
  );

  if (isPublicPath(pathnameWithoutLocalePrefix)) {
    return response;
  }

  const needsAuthentication = requiresAuthentication(pathnameWithoutLocalePrefix);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    },
    cookies: {
      get(name) {
        return request.cookies.get(name)?.value;
      },
      set(name, value, options) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name, options) {
        request.cookies.delete(name);
        response.cookies.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (!data.user && needsAuthentication) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = localizePathname("/login", locale);
    redirectUrl.searchParams.set(
      "redirectedFrom",
      localizePathname(pathnameWithoutLocalePrefix, locale),
    );

    if (locale === ENGLISH_LOCALE) {
      redirectUrl.pathname = buildLocaleSegmentPath("/login", ENGLISH_LOCALE);
      redirectUrl.searchParams.set(
        "redirectedFrom",
        buildLocaleSegmentPath(pathnameWithoutLocalePrefix, ENGLISH_LOCALE),
      );
    }

    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
