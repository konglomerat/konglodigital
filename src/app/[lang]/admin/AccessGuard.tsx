import { redirect } from "next/navigation";

import {
  type UserAccess,
  can,
  canAnywhere,
} from "@/lib/access/access";
import type { Permission } from "@/lib/access/role-config";
import { getServerAccess, getServerSession } from "@/lib/server-session";

export function NoAccessNotice() {
  return (
    <section className="border border-destructive-border bg-destructive-soft p-6">
      <h1 className="text-destructive">Kein Zugriff</h1>
      <p className="mt-2 text-destructive">
        Für diesen Bereich fehlt dir die erforderliche Berechtigung.
      </p>
    </section>
  );
}

/** Für Seiten ohne Rolle: angemeldet reicht (ohne Anmeldung leitet
 *  AccessGuard ohnehin zum Login). */
export const isSignedIn = (access: UserAccess | null) => access !== null;

type AccessGuardProps = Readonly<{
  children: React.ReactNode;
  /** Eine der Berechtigungen reicht. */
  permissions?: Permission | readonly Permission[];
  /** Ohne scope zählt nur eine globale Zuweisung, außer mit anywhere. */
  scope?: string;
  /** Auch eine Zuweisung in irgendeinem Bereich reicht. */
  anywhere?: boolean;
  /** Eigene Prüfung statt permissions, z. B. für die Vergabe. */
  check?: (access: UserAccess | null) => boolean;
}>;

export default async function AccessGuard({
  children,
  permissions,
  scope,
  anywhere = false,
  check,
}: AccessGuardProps) {
  const { user } = await getServerSession();
  if (!user) redirect("/login");

  const access = await getServerAccess();
  const list =
    typeof permissions === "string" ? [permissions] : (permissions ?? []);
  const allowed = check
    ? check(access)
    : list.some((permission) =>
        anywhere
          ? canAnywhere(access, permission)
          : can(access, permission, { scope }),
      );

  return allowed ? children : <NoAccessNotice />;
}
