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
import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export type EhrenamtsbonusAdminResponse = {
  requests: EhrenamtsbonusAdminRequest[];
};

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(await loadUserAccess(supabase, data.user), "ehrenamtsbonus.manage")) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  try {
    // Berechtigung ist geprüft; alle Anträge liest der Service-Client.
    const requests = await listAllRequests(createSupabaseAdminClient());

    // Antragsteller, Entscheidende und Stornierende in einem Rutsch — alle
    // Namen kommen aus derselben Tabelle.
    const userIds = Array.from(
      new Set([
        ...requests.map((entry) => entry.userId),
        ...requests
          .flatMap((entry) => [entry.decidedBy, entry.cancelledBy])
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
    // Anträge bleiben entscheidbar. Verbunden wird über die Kontakt-ID aus dem
    // Profil.
    const contactIds = requests
      .map((entry) => profiles.get(entry.userId)?.campaiContactId)
      .filter((id): id is string => Boolean(id));

    const snapshots = await fetchCampaiMemberSnapshots(contactIds).catch(
      () => new Map<string, { openBalanceCents: number | null }>(),
    );

    const enriched: EhrenamtsbonusAdminRequest[] = requests.map((entry) => {
      const profile = profiles.get(entry.userId);
      const contactId = profile?.campaiContactId ?? null;
      return {
        ...entry,
        applicantName: profile?.campaiName ?? null,
        applicantMemberNumber: profile?.campaiMemberNumber ?? null,
        openBalanceCents: contactId
          ? (snapshots.get(contactId)?.openBalanceCents ?? null)
          : null,
        decidedByName: entry.decidedBy
          ? (profiles.get(entry.decidedBy)?.campaiName ?? null)
          : null,
        cancelledByName: entry.cancelledBy
          ? (profiles.get(entry.cancelledBy)?.campaiName ?? null)
          : null,
      };
    });

    return NextResponse.json({
      requests: enriched,
    } satisfies EhrenamtsbonusAdminResponse);
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
