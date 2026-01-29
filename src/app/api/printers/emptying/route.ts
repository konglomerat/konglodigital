import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { fetchPrintersFromCloud } from "@/lib/bambu-cloud";
import { createSupabaseRouteClient } from "@/lib/supabase/route";

const TABLE_NAME = "printer_emptying_state";

type EmptyingRow = {
  printer_id: string;
  needs_emptying: boolean;
  last_status: string | null;
};

type PrinterWithEmptying = {
  id: string;
  name: string;
  model: string;
  serial: string;
  status: string;
  progress: number;
  jobName?: string;
  updatedAt: string;
  needsEmptying: boolean;
};

const getNowIso = () => new Date().toISOString();

export const GET = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const printers = await fetchPrintersFromCloud();
    const printerIds = printers.map((printer) => printer.id).filter(Boolean);

    let existingRows: EmptyingRow[] = [];
    if (printerIds.length > 0) {
      const { data: rows, error } = await supabase
        .from(TABLE_NAME)
        .select("printer_id,needs_emptying,last_status")
        .in("printer_id", printerIds);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      existingRows = rows ?? [];
    }

    const rowMap = new Map(existingRows.map((row) => [row.printer_id, row]));

    const updates = printers.map((printer) => {
      const existing = rowMap.get(printer.id);
      const wasPrinting = existing?.last_status === "printing";
      const isFinished = wasPrinting && printer.status === "idle";
      const needsEmptying = Boolean(existing?.needs_emptying) || isFinished;

      return {
        printer_id: printer.id,
        needs_emptying: needsEmptying,
        last_status: printer.status,
        updated_at: getNowIso(),
      };
    });

    if (updates.length > 0) {
      const { error: upsertError } = await supabase
        .from(TABLE_NAME)
        .upsert(updates, { onConflict: "printer_id" });

      if (upsertError) {
        return NextResponse.json(
          { error: upsertError.message },
          { status: 500 },
        );
      }
    }

    const updatesMap = new Map(
      updates.map((update) => [update.printer_id, update.needs_emptying]),
    );

    const responsePrinters: PrinterWithEmptying[] = printers.map((printer) => ({
      ...printer,
      needsEmptying: updatesMap.get(printer.id) ?? false,
    }));

    return NextResponse.json({ printers: responsePrinters });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load printers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export const POST = async (request: NextRequest) => {
  const { supabase } = createSupabaseRouteClient(request);
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    printerId?: string;
    needsEmptying?: boolean;
  };

  const printerId = String(body.printerId ?? "").trim();
  if (!printerId) {
    return NextResponse.json({ error: "Missing printer id." }, { status: 400 });
  }

  const needsEmptying = Boolean(body.needsEmptying);

  const { data: existing, error: existingError } = await supabase
    .from(TABLE_NAME)
    .select("last_status")
    .eq("printer_id", printerId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const { error } = await supabase.from(TABLE_NAME).upsert(
    {
      printer_id: printerId,
      needs_emptying: needsEmptying,
      last_status: existing?.last_status ?? null,
      updated_at: getNowIso(),
    },
    { onConflict: "printer_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
};
