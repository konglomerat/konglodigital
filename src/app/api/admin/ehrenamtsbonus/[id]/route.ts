// Die Entscheidung des Vorstands über einen Antrag. Es wird nicht abgestimmt:
// wer aus dem Vorstand entscheidet, entscheidet — festgehalten wird, wer es
// war. Eine Ablehnung braucht eine Begründung, weil das Mitglied sie auf
// seiner Kontoseite zu lesen bekommt.
//
// „Vorstand" ist heute die Rolle `admin`: der Campai-Tag „vorstand" wird bei
// der Registrierung auf genau diese Rolle abgebildet (siehe roles.ts).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  EHRENAMTSBONUS_TABLE,
  mapRequestRow,
  parseDecision,
  parseStatus,
} from "@/lib/ehrenamtsbonus";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { userHasRole } from "@/lib/roles";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const POST = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userHasRole(supabase, data.user, "admin"))) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const decision = parseDecision(body.decision);
  if (!decision) {
    return NextResponse.json(
      { error: "Bitte den Antrag annehmen oder ablehnen." },
      { status: 400 },
    );
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (decision === "reject" && !note) {
    return NextResponse.json(
      { error: "Eine Ablehnung braucht eine Begründung." },
      { status: 400 },
    );
  }

  if (note && note.length > 2000) {
    return NextResponse.json(
      { error: "Die Begründung darf höchstens 2000 Zeichen lang sein." },
      { status: 400 },
    );
  }

  const { data: current, error: loadError } = await supabase
    .from(EHRENAMTSBONUS_TABLE)
    .select("status")
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 400 });
  }

  const currentStatus = parseStatus(current?.status);
  if (!currentStatus) {
    return NextResponse.json(
      { error: "Antrag nicht gefunden." },
      { status: 404 },
    );
  }

  if (currentStatus !== "in_review") {
    return NextResponse.json(
      { error: "Über diesen Antrag ist bereits entschieden." },
      { status: 409 },
    );
  }

  const decidedAt = new Date().toISOString();

  // `eq("status", "in_review")` ist der eigentliche Schutz: entscheiden zwei
  // gleichzeitig, greift nur der erste Schreibvorgang.
  const { data: updated, error } = await supabase
    .from(EHRENAMTSBONUS_TABLE)
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      decision_note: note,
      decided_by: data.user.id,
      decided_at: decidedAt,
    })
    .eq("id", id)
    .eq("status", "in_review")
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Antrag konnte nicht geändert werden." },
      { status: 400 },
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Über diesen Antrag ist bereits entschieden." },
      { status: 409 },
    );
  }

  // Den eigenen Namen darf die Session lesen (RLS lässt das eigene Profil zu).
  // Damit steht direkt nach dem Klick „Angenommen von …" in der Liste, ohne
  // sie neu zu laden.
  const decider = await getMemberProfileByUserId(supabase, data.user.id).catch(
    () => null,
  );

  return NextResponse.json({
    request: mapRequestRow(updated as Record<string, unknown>),
    decidedByName: decider?.campaiName ?? null,
  });
};
