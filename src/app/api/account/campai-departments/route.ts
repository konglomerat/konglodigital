import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  fetchCampaiDepartments,
  type CampaiDepartment,
} from "@/lib/campai-contact-profile";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

// Die Abteilungen, die ein Mitglied auf der Kontoseite für sich wählen kann.
// Abgerufen erst, wenn der Dialog aufgeht — die Seite selbst braucht sie nicht.

export const dynamic = "force-dynamic";

export type AccountCampaiDepartmentsResponse = {
  departments: CampaiDepartment[];
};

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const departments = await fetchCampaiDepartments();
    return NextResponse.json<AccountCampaiDepartmentsResponse>({
      departments,
    });
  } catch {
    return NextResponse.json(
      { error: "Die Abteilungen sind gerade nicht abrufbar." },
      { status: 502 },
    );
  }
};
