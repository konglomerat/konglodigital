import { unstable_cache } from "next/cache";

import { toBuchhaltungWerkbereiche } from "@/lib/buchhaltung-werkbereiche";
import { fetchCampaiCostCenters } from "@/lib/campai-cost-centers";

// Die Sidenav steht auf jeder Verwaltungsseite — die Kostenstellen ändern sich
// selten, also nicht bei jedem Seitenwechsel Campai fragen.
export const getBuchhaltungWerkbereiche = unstable_cache(
  async () => toBuchhaltungWerkbereiche(await fetchCampaiCostCenters()),
  ["buchhaltung-werkbereiche"],
  { revalidate: 300 },
);
