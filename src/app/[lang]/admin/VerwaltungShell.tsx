// Gemeinsamer Verwaltungsrahmen: dieselbe Ressort-Leiste auf allen Zielseiten,
// auch auf /receipts und /kofi ausserhalb von /admin.
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import {
  type BuchhaltungWerkbereich,
  getWerkbereichHref,
} from "@/lib/buchhaltung-werkbereiche";
import { getBuchhaltungWerkbereiche } from "@/lib/buchhaltung-werkbereiche-server";
import { getUserRoles } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import VerwaltungSideNav from "./VerwaltungSideNav";
import { RESSORTS, getVerwaltungEntryHref } from "./ressorts";

// Ohne Campai bleibt die Buchhaltung ein einzelner Punkt, die Seite selbst
// zeigt dann den Fehler.
const loadWerkbereiche = async (): Promise<BuchhaltungWerkbereich[]> => {
  try {
    return await getBuchhaltungWerkbereiche();
  } catch {
    return [];
  }
};

export default async function VerwaltungShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const [{ data: userData }, werkbereiche] = await Promise.all([
    supabase.auth.getUser(),
    loadWerkbereiche(),
  ]);
  const roles = await getUserRoles(supabase, userData.user);
  const homeHref = localizePathname(getVerwaltungEntryHref(roles), locale);

  const items = RESSORTS.map((ressort) => {
    const ressortChildren =
      ressort.id === "buchhaltung"
        ? werkbereiche.map((werkbereich) => ({
            href: getWerkbereichHref(werkbereich),
            label: werkbereich.label,
          }))
        : (ressort.children ?? []);

    return {
      ...ressort,
      href: localizePathname(ressort.href, locale),
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
      <VerwaltungSideNav items={items} homeHref={homeHref} />
      <div className="min-w-0 px-4 py-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-7 md:py-10">
        {children}
      </div>
    </div>
  );
}
