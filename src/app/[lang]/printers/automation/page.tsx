import { can } from "@/lib/access/access";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession, getServerAccess } from "@/lib/server-session";
import AutomationClient from "./AutomationClient";

export default async function PrinterAutomationPage() {
  const { user } = await getServerSession();
  if (!user) redirect("/login?redirectedFrom=/printers/automation");
  if (!can(await getServerAccess(), "ressort.admin")) return <section className="mx-auto max-w-xl rounded-lg border border-border bg-card p-6">
    <h1 className="text-2xl font-bold">Admin-Zugriff erforderlich</h1>
    <p className="mt-3">Die Druckautomatik und Kamerabilder sind nur für Admins freigegeben. Dein aktuell angemeldetes Konto hat diese Freigabe nicht.</p>
    <p className="mt-3 text-sm text-muted-foreground">Im Profil kannst du dein Konto prüfen und dich bei Bedarf abmelden, um ein Admin-Konto zu verwenden.</p>
    <Link href="/account" className="mt-4 inline-block font-bold text-primary underline">Zum Profil</Link>
  </section>;
  return <AutomationClient />;
}
