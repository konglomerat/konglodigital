import { redirect } from "next/navigation";

import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import VerwaltungShell from "./VerwaltungShell";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login?redirectedFrom=/admin/users");
  }

  const [canAccessAdmin, canAccessVolkshaus] = await Promise.all([
    userCanAccessModule(supabase, data.user, "admin"),
    userCanAccessModule(supabase, data.user, "volkshaus"),
  ]);

  if (!canAccessAdmin && !canAccessVolkshaus) {
    return (
      // Der Rahmen bleibt stehen, damit man von hier weiternavigieren kann.
      <VerwaltungShell>
        <section className="border border-destructive-border bg-destructive-soft p-6">
          <h1 className="text-destructive">Kein Zugriff</h1>
          <p className="mt-2 text-destructive">
            Für diesen Bereich fehlt dir die erforderliche Rolle.
          </p>
        </section>
      </VerwaltungShell>
    );
  }

  return <VerwaltungShell>{children}</VerwaltungShell>;
}
