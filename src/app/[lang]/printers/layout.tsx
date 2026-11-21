import { can } from "@/lib/access/access";
import Link from "next/link";
import { getServerAccess } from "@/lib/server-session";
import { getServerI18n } from "@/i18n/server";
import { localizePathname } from "@/i18n/config";

export default async function PrintersLayout({ children }: { children: React.ReactNode }) {
  const access = await getServerAccess();
  const { locale } = await getServerI18n();
  return <>
    {can(access, "ressort.admin") && <nav aria-label="Drucker-Verwaltung" className="mb-5 flex flex-wrap justify-end gap-4 text-sm">
      <Link href={localizePathname("/printers", locale)} className="font-bold hover:underline">Druckerübersicht</Link>
      <Link href={localizePathname("/printers/automation", locale)} className="font-bold text-primary hover:underline">Druckautomatik · Admin</Link>
    </nav>}
    {children}
  </>;
}
