import { redirect } from "next/navigation";

import { type AppModule, userCanAccessModule } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ModuleAccessGuard({
  children,
  module,
}: Readonly<{
  children: React.ReactNode;
  module: AppModule;
}>) {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  if (!(await userCanAccessModule(supabase, data.user, module))) {
    return (
      <section className="rounded-lg border border-destructive-border bg-destructive-soft p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-destructive">
          Kein Zugriff
        </h1>
        <p className="mt-2 text-sm text-destructive">
          Für diesen Bereich fehlt dir die erforderliche Rolle.
        </p>
      </section>
    );
  }

  return children;
}
