// Die Entscheidung des Vorstands über einen Antrag. Es wird nicht abgestimmt:
// wer aus dem Vorstand entscheidet, entscheidet — festgehalten wird, wer es
// war. Eine Ablehnung braucht eine Begründung, weil das Mitglied sie auf
// seiner Kontoseite zu lesen bekommt.
//
// Dieselbe Route nimmt auch die Stornierung entgegen: die Rücknahme eines
// schon angenommenen Bonus, ebenfalls nur mit Begründung. Ein offener Antrag
// wird nicht storniert, sondern abgelehnt.
//
// Nach Annehmen oder Ablehnen laufen die Folgen (ehrenamtsbonus-followup.ts):
// Abo in Campai pausieren, Nachricht über Campai, Roseguarden-Aufgaben. Ihr
// Ergebnis kommt mit der Antwort zurück; `retry` wiederholt fehlgeschlagene
// Schritte.
//
// „Vorstand" ist heute die Rolle `admin`: der Campai-Tag „vorstand" wird bei
// der Registrierung auf genau diese Rolle abgebildet (siehe roles.ts).
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  EHRENAMTSBONUS_TABLE,
  mapRequestRow,
  parseAdminAction,
  parseStatus,
} from "@/lib/ehrenamtsbonus";
import {
  type FollowUpStep,
  runFollowUp,
  stepsFor,
} from "@/lib/ehrenamtsbonus-followup";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { can } from "@/lib/access/access";
import { loadUserAccess } from "@/lib/access/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  if (
    !can(await loadUserAccess(supabase, data.user), "ehrenamtsbonus.manage")
  ) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (body.decision === "retry") {
    return retry(id, body.steps, data.user.id);
  }

  const action = parseAdminAction(body.decision);
  if (!action) {
    return NextResponse.json(
      { error: "Bitte den Antrag annehmen, ablehnen oder stornieren." },
      { status: 400 },
    );
  }

  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  if (action === "reject" && !note) {
    return NextResponse.json(
      { error: "Eine Ablehnung braucht eine Begründung." },
      { status: 400 },
    );
  }

  if (action === "cancel" && !note) {
    return NextResponse.json(
      { error: "Eine Stornierung braucht eine Begründung." },
      { status: 400 },
    );
  }

  if (note && note.length > 2000) {
    return NextResponse.json(
      { error: "Die Begründung darf höchstens 2000 Zeichen lang sein." },
      { status: 400 },
    );
  }

  // Berechtigung ist geprüft; Anträge anderer liest und ändert der
  // Service-Client.
  const adminClient = createSupabaseAdminClient();
  const { data: current, error: loadError } = await adminClient
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

  // Der Status, aus dem heraus die Aktion zulässig ist — und zugleich die
  // Bedingung des Schreibvorgangs: greifen zwei gleichzeitig zu, gewinnt der
  // erste, der zweite bekommt den Konflikt.
  const requiredStatus = action === "cancel" ? "approved" : "in_review";
  const conflictMessage =
    action === "cancel"
      ? "Nur ein angenommener Bonus lässt sich stornieren."
      : "Über diesen Antrag ist bereits entschieden.";

  if (currentStatus !== requiredStatus) {
    return NextResponse.json({ error: conflictMessage }, { status: 409 });
  }

  const now = new Date().toISOString();

  // Eine Stornierung lässt die getroffene Entscheidung stehen — wer wann
  // zugestimmt hat, bleibt am Antrag ablesbar. Sie schreibt nur den Status um
  // und legt ihre eigene Begründung daneben.
  const patch =
    action === "cancel"
      ? {
          status: "cancelled",
          cancellation_note: note,
          cancelled_by: data.user.id,
          cancelled_at: now,
        }
      : {
          status: action === "approve" ? "approved" : "rejected",
          decision_note: note,
          decided_by: data.user.id,
          decided_at: now,
        };

  const { data: updated, error } = await adminClient
    .from(EHRENAMTSBONUS_TABLE)
    .update(patch)
    .eq("id", id)
    .eq("status", requiredStatus)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Antrag konnte nicht geändert werden." },
      { status: 400 },
    );
  }

  if (!updated) {
    return NextResponse.json({ error: conflictMessage }, { status: 409 });
  }

  // Den eigenen Namen darf die Session lesen (RLS lässt das eigene Profil zu).
  // Damit steht direkt nach dem Klick „Angenommen von …" in der Liste, ohne
  // sie neu zu laden.
  const actor = await getMemberProfileByUserId(supabase, data.user.id).catch(
    () => null,
  );
  const actorName = actor?.campaiName ?? null;

  const mapped = mapRequestRow(updated as Record<string, unknown>);
  const campaiSync = mapped
    ? await runFollowUp({
        client: adminClient,
        request: mapped,
        action,
        note,
        actorId: data.user.id,
      })
    : null;

  return NextResponse.json({
    request: mapped ? { ...mapped, campaiSync } : null,
    decidedByName: action === "cancel" ? null : actorName,
    cancelledByName: action === "cancel" ? actorName : null,
  });
};

/** Wiederholt fehlgeschlagene Folgeschritte einer Entscheidung. */
const retry = async (id: string, rawSteps: unknown, actorId: string) => {
  const adminClient = createSupabaseAdminClient();
  const { data: row, error } = await adminClient
    .from(EHRENAMTSBONUS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  const request = row ? mapRequestRow(row as Record<string, unknown>) : null;
  if (!request)
    return NextResponse.json(
      { error: "Antrag nicht gefunden." },
      { status: 404 },
    );
  if (request.status === "in_review") {
    return NextResponse.json(
      { error: "Vor der Entscheidung gibt es nichts zu wiederholen." },
      { status: 409 },
    );
  }
  const action =
    request.status === "approved"
      ? "approve"
      : request.status === "cancelled"
        ? "cancel"
        : "reject";
  const allowed = stepsFor(request, action);
  const steps = (Array.isArray(rawSteps) ? rawSteps : []).filter(
    (step): step is FollowUpStep => allowed.includes(step as FollowUpStep),
  );
  if (steps.length === 0) {
    return NextResponse.json(
      { error: "Kein Schritt zum Wiederholen." },
      { status: 400 },
    );
  }
  const campaiSync = await runFollowUp({
    client: adminClient,
    request,
    action,
    note: action === "cancel" ? request.cancellationNote : request.decisionNote,
    actorId,
    only: steps,
  });
  return NextResponse.json({ campaiSync });
};
