import { createBrowserClient } from "@supabase/ssr";

/** Shares the cookie session created by /api/auth/signin with the OAuth consent UI. */
export const createSupabaseCookieBrowserClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY at build time.",
    );
  }
  return createBrowserClient(url, key);
};
