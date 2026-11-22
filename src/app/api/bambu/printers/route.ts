import { NextResponse } from "next/server";

import { fetchPrintersFromCloud } from "@/lib/bambu-cloud";

export const GET = async () => {
  try {
    const printers = await fetchPrintersFromCloud();
    // Detailed material selection belongs to the admin automation endpoint.
    return NextResponse.json({ printers: printers.map(({ materialInventory, ...printer }) => {
      void materialInventory;
      return printer;
    }) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load printers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};
