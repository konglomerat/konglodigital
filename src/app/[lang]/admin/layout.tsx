import { redirect } from "next/navigation";

import ActiveNavLink from "@/app/ActiveNavLink";
import { localizePathname } from "@/i18n/config";
import { getRequestLocale } from "@/i18n/server";
import { userCanAccessModule } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();
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

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 rounded-3xl border border-zinc-200 bg-white p-2 shadow-sm">
        <ActiveNavLink
          href={localizePathname("/admin/users", locale)}
          exact
          className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          activeClassName="bg-blue-600 text-white hover:bg-blue-600 hover:text-white"
        >
          Benutzer
        </ActiveNavLink>
        <ActiveNavLink
          href={localizePathname("/admin/generate-newsletter", locale)}
          exact
          className="rounded-full px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          activeClassName="bg-blue-600 text-white hover:bg-blue-600 hover:text-white"
        >
          Newsletter erzeugen
        </ActiveNavLink>
      </nav>

      {children}
    </div>
  );
}