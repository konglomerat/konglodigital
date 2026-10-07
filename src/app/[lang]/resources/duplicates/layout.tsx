import AccessGuard from "../../admin/AccessGuard";

// Dubletten auflösen löscht Einträge — nur mit resources.delete.
export default function DuplicatesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccessGuard permissions="resources.delete">{children}</AccessGuard>;
}
