import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/server-session";

import VerwaltungShell from "./VerwaltungShell";

// Zugriff prüft jede Seite selbst über AccessGuard bzw. can() — der Rahmen
// bleibt stehen, damit man von „Kein Zugriff" aus weiternavigieren kann.
export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user } = await getServerSession();

  if (!user) {
    redirect("/login?redirectedFrom=/admin");
  }

  return <VerwaltungShell>{children}</VerwaltungShell>;
}
