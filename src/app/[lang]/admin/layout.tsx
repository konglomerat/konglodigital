import { redirect } from "next/navigation";

import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  if (!(await userCanAccessModule(supabase, data.user, "admin"))) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-rose-900">Kein Zugriff</h1>
        <p className="mt-2 text-sm text-rose-700">
          Dieser Bereich ist nur fuer Mitglieder mit der Rolle Admin verfuegbar.
        </p>
      </section>
    );
  }

  return children;
}