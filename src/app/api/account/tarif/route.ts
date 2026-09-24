import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { CampaiAccessTariff } from "@/lib/campai-member-tariff";
import { fetchCampaiMemberSnapshot } from "@/lib/campai-member-tariff";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

// Tarif und offener Beitrag der Kontoseite. Wie beim Namensabgleich steht das
// hier allein und nicht in der Server-Hülle von /account: der Abruf kostet
// zwei Campai-Aufrufe und darf den ersten Paint nicht aufhalten. Die Kachel
// rendert ohne Werte und füllt sich nach.
export type AccountTarifResponse = {
  tariff: CampaiAccessTariff | null;
  openBalanceCents: number | null;
};

const leer: AccountTarifResponse = { tariff: null, openBalanceCents: null };

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberProfile = await getMemberProfileByUserId(
    supabase,
    data.user.id,
  ).catch(() => null);

  if (!memberProfile?.campaiMemberNumber) {
    return NextResponse.json(leer);
  }

  try {
    const snapshot = await fetchCampaiMemberSnapshot(
      memberProfile.campaiMemberNumber,
    );
    return NextResponse.json(snapshot ?? leer);
  } catch {
    // Ohne Campai bleibt die Kachel bei „nicht abrufbar" — kein Fehlerfall
    // für die Seite.
    return NextResponse.json(leer);
  }
};
