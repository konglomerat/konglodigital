import { NextResponse, type NextRequest } from "next/server";

import { getUserRole } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";
import { listVolkshausBookings } from "@/lib/volkshaus-booking-store";

const resolvePublicOrigin = (request: NextRequest) => {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/+$/, "");
  }
  return request.nextUrl.origin;
};

export const dynamic = "force-dynamic";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((await getUserRole(supabase, data.user)) !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const origin = resolvePublicOrigin(request);
    const bookings = (await listVolkshausBookings()).map((booking) => ({
      ...booking,
      accessUrl: `${origin}/volkshaus/anfrage/${booking.accessToken}`,
    }));
    return NextResponse.json({ bookings });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Buchungsanfragen konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
};

