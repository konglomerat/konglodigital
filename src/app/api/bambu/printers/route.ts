import { NextResponse } from "next/server";

import { fetchPrintersFromCloud } from "@/lib/bambu-cloud";

export const GET = async () => {
  try {
    const printers = await fetchPrintersFromCloud();
    return NextResponse.json({ printers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load printers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
