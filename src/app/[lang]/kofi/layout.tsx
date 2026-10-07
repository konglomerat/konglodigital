// KoFi gehört zum Verwaltungsbereich: gleiches Sidemenü wie /admin.
import AccessGuard from "../admin/AccessGuard";
import VerwaltungShell from "../admin/VerwaltungShell";

// KoFi rechnet über alle Kostenstellen — nur mit globaler Berechtigung.
export default function KofiLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <VerwaltungShell>
      <AccessGuard permissions="kofi.view">{children}</AccessGuard>
    </VerwaltungShell>
  );
}
