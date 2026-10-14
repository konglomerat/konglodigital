import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { canAnywhere } from "@/lib/access/access";
import { forbiddenResponse, loadUserAccess } from "@/lib/access/server";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !canAnywhere(await loadUserAccess(supabase, data.user), "receipts.edit")
  ) {
    return forbiddenResponse();
  }

  const cashAccountId = process.env.CAMPAI_PRETIX_CASH_ACCOUNT?.trim() ?? "";
  return NextResponse.json({ cashAccountId });
};
