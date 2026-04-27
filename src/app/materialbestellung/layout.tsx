import { redirect } from "next/navigation";

import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MaterialbestellungLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient({ readOnly: true });
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login?redirectedFrom=/materialbestellung");
  }

  if (!(await userCanAccessModule(supabase, data.user, "invoices"))) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-6 md:px-0 md:py-0">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-rose-900">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-rose-700">
            Die Materialbestellung ist aktuell nur fuer Mitglieder mit der Rolle Accounting oder Admin freigegeben.
          </p>
        </div>
      </section>
    );
  }

  return children;
}
