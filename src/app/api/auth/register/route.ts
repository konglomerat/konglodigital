import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const POST = async (request: NextRequest) => {
  const { supabase, response } = createSupabaseRouteClient(request);
  const { email, password, firstName, lastName } = (await request.json()) as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };

  if (!email || !password || !firstName || !lastName) {
    return NextResponse.json(
      { error: "Email, password, first name, and last name are required." },
      { status: 400 },
    );
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { headers: response.headers });
};
