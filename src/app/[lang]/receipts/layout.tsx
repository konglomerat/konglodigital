// Belegübersicht gehört zum Verwaltungsbereich: gleiches Sidemenü wie /admin.
import VerwaltungShell from "../admin/VerwaltungShell";

export default function ReceiptsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <VerwaltungShell>{children}</VerwaltungShell>;
}
