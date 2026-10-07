import { VOLKSHAUS_SCOPE_ID } from "@/lib/access/scopes";

import AccessGuard from "../AccessGuard";

export default function VolkshausAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AccessGuard
      permissions="volkshaus.bookings.manage"
      scope={VOLKSHAUS_SCOPE_ID}
    >
      {children}
    </AccessGuard>
  );
}
