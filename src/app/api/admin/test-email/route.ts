import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const TEST_RECIPIENT = "robert@wirewire.de";

const createForbiddenResponse = () =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

const createUnauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const POST = async (request: NextRequest) => {
  try {
    const { supabase } = createSupabaseRouteClient(request);
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      return createUnauthorizedResponse();
    }

    if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
      return createForbiddenResponse();
    }

    const redirectTo = new URL("/register/complete", request.url).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(
      TEST_RECIPIENT,
      {
        redirectTo,
      },
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, recipient: TEST_RECIPIENT });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Test-E-Mail konnte nicht gesendet werden.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
