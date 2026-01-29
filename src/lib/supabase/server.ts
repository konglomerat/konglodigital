import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

export const createSupabaseServerClient = async (options?: {
  readOnly?: boolean;
}) => {
  const cookieStore = await cookies();
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
  const readOnly = options?.readOnly ?? false;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        if (readOnly) {
          return;
        }
        cookieStore.set({ name, value, ...options });
      },
      remove(name, options) {
        if (readOnly) {
          return;
        }
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
};
