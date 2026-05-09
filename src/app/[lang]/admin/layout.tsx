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
      <section className="rounded-3xl border border-destructive-border bg-destructive-soft p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-destructive">Kein Zugriff</h1>
        <p className="mt-2 text-sm text-destructive">
          Dieser Bereich ist nur fuer Mitglieder mit der Rolle Admin verfuegbar.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 rounded-3xl border border-border bg-card p-2 shadow-sm">
        <ActiveNavLink
          href={localizePathname("/admin/users", locale)}
          exact
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
          activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        >
          Benutzer
        </ActiveNavLink>
        <ActiveNavLink
          href={localizePathname("/admin/contacts", locale)}
          exact
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
          activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        >
          Mitglieder
        </ActiveNavLink>
        <ActiveNavLink
          href={localizePathname("/kofi", locale)}
          exact
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
          activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        >
          KoFi
        </ActiveNavLink>
        <ActiveNavLink
          href={localizePathname("/admin/generate-newsletter", locale)}
          exact
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
          activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        >
          Newsletter erzeugen
        </ActiveNavLink>
        <ActiveNavLink
          href={localizePathname("/admin/generate-story", locale)}
          exact
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
          activeClassName="bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
        >
          Storys erzeugen
        </ActiveNavLink>
      </nav>

      {children}
    </div>
  );
}
