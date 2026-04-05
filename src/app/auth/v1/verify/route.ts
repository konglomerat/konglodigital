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
    const target = new URL(`${supabaseUrl}/auth/v1/verify`);

    for (const [key, value] of request.nextUrl.searchParams.entries()) {
      target.searchParams.append(key, value);
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
