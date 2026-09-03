// Gemeinsamer Verwaltungsrahmen: dieselbe Ressort-Leiste auf allen Zielseiten,
// auch auf /receipts und /kofi ausserhalb von /admin.
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import { getUserRoles } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import VerwaltungSideNav from "./VerwaltungSideNav";
import { RESSORTS, getVerwaltungEntryHref } from "./ressorts";

export default async function VerwaltungShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data: userData } = await supabase.auth.getUser();
  const roles = await getUserRoles(supabase, userData.user);
  const homeHref = localizePathname(getVerwaltungEntryHref(roles), locale);

  const items = RESSORTS.map((ressort) => ({
    ...ressort,
    href: localizePathname(ressort.href, locale),
  }));

  return (
    <div className="md:grid md:h-full md:grid-cols-[220px_minmax(0,1fr)] md:items-stretch">
      <VerwaltungSideNav items={items} homeHref={homeHref} />
      <div className="min-w-0 px-4 py-6 md:h-full md:overflow-y-auto md:px-7 md:py-10">
        {children}
      </div>
    </div>
  );
}
