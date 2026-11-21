import { getRequestLocale } from "@/i18n/server";

import AccessGuard from "../AccessGuard";
import AdminUsersClient from "./AdminUsersClient";

export const dynamic = "force-dynamic";

// Kein Layout-Gate: die Profilansicht /admin/users/[userId] prüft
// access.manage statt users.manage.
export default async function AdminUsersPage() {
  return (
    <AccessGuard permissions="users.manage">
      <AdminUsersClient locale={await getRequestLocale()} />
    </AccessGuard>
  );
}
