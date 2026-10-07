// Gemeinsamer Verwaltungsrahmen: dieselbe Ressort-Leiste auf allen Zielseiten,
// auch auf /receipts und /kofi ausserhalb von /admin. Die Leiste zeigt nur,
// was der Nutzer öffnen darf (mit Rechte-Vorschau: was die Person darf).
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import {
  type BuchhaltungWerkbereich,
  filterAllowedWerkbereiche,
  getWerkbereichHref,
} from "@/lib/buchhaltung-werkbereiche";
import { getBuchhaltungWerkbereiche } from "@/lib/buchhaltung-werkbereiche-server";
import { listPeople } from "@/lib/access/people";
import {
  canPreviewAccess,
  loadAllowedCostCenters,
  readAccessPreviewUserId,
} from "@/lib/access/server";
import Notice from "@/components/knglmrt/Notice";
import {
  getServerAccess,
  getServerRealAccess,
  getServerSession,
} from "@/lib/server-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { AccessPreviewState } from "./AccessPreviewSwitch";

import VerwaltungSideNav from "./VerwaltungSideNav";
import { getVerwaltungEntryHref, getVisibleRessorts } from "./ressorts";

// Ohne Campai bleibt die Buchhaltung ein einzelner Punkt, die Seite selbst
// zeigt dann den Fehler.
const loadWerkbereiche = async (): Promise<BuchhaltungWerkbereich[]> => {
  try {
    return await getBuchhaltungWerkbereiche();
  } catch {
    return [];
  }
};

// Nur wer echt (nicht in einer Vorschau) access.manage hat, bekommt den
// Testschalter. Den Namen der Person braucht nur der Hinweis über dem Inhalt.
const loadAccessPreview = async (): Promise<AccessPreviewState | null> => {
  const { user } = await getServerSession();
  if (!canPreviewAccess(await getServerRealAccess())) {
    return null;
  }

  const userId = await readAccessPreviewUserId();
  if (!userId || userId === user?.id) {
    return { userId: null, name: null };
  }

  const people = await listPeople(createSupabaseAdminClient()).catch(() => []);
  const person = people.find((entry) => entry.id === userId);
  return { userId, name: person ? person.name || person.email : userId };
};

export default async function VerwaltungShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const { supabase } = await getServerSession();
  const access = await getServerAccess();
  const [werkbereiche, allowedCostCenters, accessPreview] = await Promise.all([
    loadWerkbereiche(),
    loadAllowedCostCenters(supabase, access, "receipts.view"),
    loadAccessPreview(),
  ]);
  // Ohne sichtbares Ressort (z. B. Admin in der Vorschau einer Person ohne
  // Rolle) bleibt der Titel ein Link auf das eigene Konto.
  const homeHref = localizePathname(
    getVerwaltungEntryHref(access) ?? "/account",
    locale,
  );

  // Nur Daten an die Client-Leiste — die canOpen-Funktionen bleiben hier.
  const items = getVisibleRessorts(access).map((ressort) => {
    const ressortChildren =
      ressort.id === "buchhaltung"
        ? filterAllowedWerkbereiche(werkbereiche, allowedCostCenters).map(
            (werkbereich) => ({
              href: getWerkbereichHref(werkbereich),
              label: werkbereich.label,
            }),
          )
        : (ressort.children ?? []).filter((child) => child.canOpen(access));

    return {
      href: localizePathname(ressort.href, locale),
      label: ressort.label,
      match: ressort.match,
      children: ressortChildren.map((child) => ({
        href: localizePathname(child.href, locale),
        label: child.label,
        match: child.href,
      })),
    };
  });

  return (
    // Unter lg steht die Navigation als Zeile über dem Inhalt, ab lg als
    // Spalte daneben.
    <div className="flex flex-col md:h-full lg:flex-row">
      <VerwaltungSideNav
        items={items}
        homeHref={homeHref}
        accessPreview={accessPreview}
      />
      <div className="min-w-0 px-4 py-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-7 md:py-10">
        {accessPreview?.userId ? (
          <Notice tone="gelb" className="mb-6">
            Vorschau: Du siehst die Verwaltung mit den Rechten von{" "}
            <strong>{accessPreview.name}</strong>. Nur die Rechte sind
            getauscht — eigene Daten und „vergeben von“ bleiben deine. Beenden
            unten links in der Leiste.
          </Notice>
        ) : null}
        {children}
      </div>
    </div>
  );
}
