// Startseite der Buchhaltung: je Werkbereich, den der Nutzer sehen darf, eine
// Kachel auf seine Belegseite. Bei nur einem geht es direkt dorthin.
import { redirect } from "next/navigation";

import Notice from "@/components/knglmrt/Notice";
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import { loadAllowedCostCenters } from "@/lib/access/server";
import {
  type BuchhaltungWerkbereich,
  filterAllowedWerkbereiche,
  getWerkbereichHref,
} from "@/lib/buchhaltung-werkbereiche";
import { getBuchhaltungWerkbereiche } from "@/lib/buchhaltung-werkbereiche-server";
import { getServerAccess, getServerSession } from "@/lib/server-session";

import RessortPage from "../admin/RessortPage";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  let werkbereiche: BuchhaltungWerkbereich[] = [];
  let loadError: string | null = null;

  try {
    const { supabase } = await getServerSession();
    const [all, allowed] = await Promise.all([
      getBuchhaltungWerkbereiche(),
      loadAllowedCostCenters(supabase, await getServerAccess(), "receipts.view"),
    ]);
    werkbereiche = filterAllowedWerkbereiche(all, allowed);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Werkbereiche konnten nicht geladen werden.";
  }

  if (werkbereiche.length === 1) {
    redirect(
      localizePathname(getWerkbereichHref(werkbereiche[0]), await getRequestLocale()),
    );
  }

  return (
    <RessortPage
      title="Buchhaltung"
      subTitle="Belege und Salden je Werkbereich."
      wrapLinks
      links={werkbereiche.map((werkbereich) => ({
        href: getWerkbereichHref(werkbereich),
        label: werkbereich.label,
      }))}
    >
      {werkbereiche.length === 0 ? (
        <Notice tone="rosa">
          {loadError ??
            "Für dich ist in Campai kein Werkbereich freigegeben oder angelegt."}
        </Notice>
      ) : null}
    </RessortPage>
  );
}
