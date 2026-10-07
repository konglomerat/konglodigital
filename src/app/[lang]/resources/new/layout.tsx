import AccessGuard, { isSignedIn } from "../../admin/AccessGuard";

// Anlegen darf jedes angemeldete Mitglied.
export default function NewResourceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccessGuard check={isSignedIn}>{children}</AccessGuard>;
}
