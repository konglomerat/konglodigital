// KoFi gehört zum Verwaltungsbereich: gleiches Sidemenü wie /admin.
import VerwaltungShell from "../admin/VerwaltungShell";

export default function KofiLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <VerwaltungShell>{children}</VerwaltungShell>;
}
