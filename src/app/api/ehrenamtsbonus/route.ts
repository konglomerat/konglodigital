// Ehrenamtsbonus aus Mitgliedersicht: eigene Anträge lesen und einen neuen
// einreichen. Jahresbeitrag-Status und aktueller Zugang kommen nicht aus dem
// Formular, sondern werden hier neu aufgelöst — sonst könnte ein Mitglied
// seine Matrix-Zeile selbst wählen.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  EHRENAMTSBONUS_TABLE,
  EhrenamtsbonusValidationError,
  inputToRow,
  listOwnRequests,
  listSelectableQuarterStarts,
  mapRequestRow,
  parseEhrenamtsbonusInput,
} from "@/lib/ehrenamtsbonus";
import { resolveEhrenamtsbonusContext } from "@/lib/ehrenamtsbonus-context";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requests = await listOwnRequests(supabase, data.user.id);
    return NextResponse.json({ requests });
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

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  const context = await resolveEhrenamtsbonusContext(supabase, data.user.id);
  const quarterStarts = listSelectableQuarterStarts().map(
    (entry) => entry.value,
  );

  let row: ReturnType<typeof inputToRow>;
  try {
    row = inputToRow(
      parseEhrenamtsbonusInput(body, quarterStarts),
      data.user.id,
      context,
    );
  } catch (validationError) {
    if (validationError instanceof EhrenamtsbonusValidationError) {
      return NextResponse.json(
        { error: validationError.message },
        { status: 400 },
      );
    }
    throw validationError;
  }

  const { data: inserted, error } = await supabase
    .from(EHRENAMTSBONUS_TABLE)
    .insert(row)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Antrag konnte nicht gespeichert werden." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    request: mapRequestRow(inserted as Record<string, unknown>),
  });
};
