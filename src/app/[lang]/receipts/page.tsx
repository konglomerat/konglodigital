// Die Buchhaltung hat keine eigene Übersicht mehr: jeder Werkbereich ist eine
// Unterseite. Hier geht es weiter zum zuletzt geöffneten, sonst zum ersten —
// jeweils nur unter denen, die der Nutzer sehen darf.
import { redirect } from "next/navigation";

import Notice from "@/components/knglmrt/Notice";
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import { loadAllowedCostCenters } from "@/lib/access/server";
import {
  type BuchhaltungWerkbereich,
  filterAllowedWerkbereiche,
  findBuchhaltungWerkbereich,
  getWerkbereichHref,
} from "@/lib/buchhaltung-werkbereiche";
import { getBuchhaltungWerkbereiche } from "@/lib/buchhaltung-werkbereiche-server";
import { getMemberProfileByUserId } from "@/lib/member-profiles";
import { getServerAccess, getServerSession } from "@/lib/server-session";

export const dynamic = "force-dynamic";

const getLastWerkbereichValue = async (): Promise<string | null> => {
  const { supabase, user } = await getServerSession();
  if (!user) {
    return null;
  }

  const profile = await getMemberProfileByUserId(supabase, user.id).catch(
    () => null,
  );
  return profile?.preferences?.balance?.costCenter2?.[0] ?? null;
};

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

  const lastValue = werkbereiche.length > 0 ? await getLastWerkbereichValue() : null;
  const target =
    (lastValue ? findBuchhaltungWerkbereich(werkbereiche, lastValue) : null) ??
    werkbereiche[0];

  if (target) {
    redirect(localizePathname(getWerkbereichHref(target), await getRequestLocale()));
  }

  return (
    <div className="flex flex-col gap-4">
      <h2>Buchhaltung</h2>
      <Notice tone="rosa">
        {loadError ??
          "Für dich ist in Campai kein Werkbereich freigegeben oder angelegt."}
      </Notice>
    </div>
  );
}
