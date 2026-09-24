// Ehrenamtsbonus aus Vorstandssicht: alle Anträge mit Antragstellernamen und
// dem offenen Beitrag aus Campai. Die Anträge kommen über die Session — die
// Vorstands-Policy lässt Admins alles lesen. Nur die Namen brauchen den
// Service-Role-Client, weil member_profiles per RLS auf das eigene Profil
// beschränkt ist.
//
// Der offene Beitrag wird nicht gespeichert: Campai liefert ihn zusammen mit
// dem Tarif im CRM-Kontakt, für die ganze Liste in wenigen Aufrufen.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchCampaiMemberSnapshots } from "@/lib/campai-member-tariff";
import type { EhrenamtsbonusAdminRequest } from "@/lib/ehrenamtsbonus";
import { listAllRequests } from "@/lib/ehrenamtsbonus";
import type { MemberProfile } from "@/lib/member-profiles";
import { listMemberProfilesByUserIds } from "@/lib/member-profiles";
import { userHasRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userHasRole(supabase, data.user, "admin"))) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  try {
    const requests = await listAllRequests(supabase);

    // Antragsteller und Entscheidende in einem Rutsch — beide Namen kommen aus
    // derselben Tabelle.
    const userIds = Array.from(
      new Set([
        ...requests.map((entry) => entry.userId),
        ...requests
          .map((entry) => entry.decidedBy)
          .filter((value): value is string => Boolean(value)),
      ]),
    );

    // Ohne Service-Role-Schlüssel bleibt die Liste bedienbar, nur ohne Namen.
    let profiles = new Map<string, MemberProfile>();
    if (userIds.length > 0) {
      try {
        profiles = await listMemberProfilesByUserIds(
          createSupabaseAdminClient(),
          userIds,
        );
      } catch {
        profiles = new Map();
      }
    }

    // Dasselbe gilt für Campai: fällt der Abruf aus, fehlen die Beträge, die
    // Anträge bleiben entscheidbar. Verbunden wird über die Mitgliedsnummer —
    // die CRM-API kennt die Kontakt-IDs der alten API nicht.
    const memberNumbers = requests
      .map((entry) => profiles.get(entry.userId)?.campaiMemberNumber)
      .filter((number): number is string => Boolean(number));

    const snapshots = await fetchCampaiMemberSnapshots(memberNumbers).catch(
      () => new Map<string, { openBalanceCents: number | null }>(),
    );

    const enriched: EhrenamtsbonusAdminRequest[] = requests.map((entry) => {
      const profile = profiles.get(entry.userId);
      const memberNumber = profile?.campaiMemberNumber ?? null;
      return {
        ...entry,
        applicantName: profile?.campaiName ?? null,
        applicantMemberNumber: memberNumber,
        openBalanceCents: memberNumber
          ? (snapshots.get(memberNumber)?.openBalanceCents ?? null)
          : null,
        decidedByName: entry.decidedBy
          ? (profiles.get(entry.decidedBy)?.campaiName ?? null)
          : null,
      };
    });

    return NextResponse.json({ requests: enriched });
  } catch (loadError) {
    return NextResponse.json(
      {
        error:
          loadError instanceof Error
            ? loadError.message
            : "Anträge konnten nicht geladen werden.",
      },
      { status: 500 },
    );
  }
};
