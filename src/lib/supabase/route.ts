import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const createSupabaseRouteClient = (request: NextRequest) => {
  const response = new NextResponse();
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    },
    cookies: {
      get(name) {
        return request.cookies.get(name)?.value;
      },
      set(name, value, options) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name, options) {
        response.cookies.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });

  return { supabase, response };
};

export const withSupabaseCookies = (
  target: NextResponse,
  source: NextResponse,
) => {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }

  return target;
};
