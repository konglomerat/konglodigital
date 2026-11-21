// Belegübersicht gehört zum Verwaltungsbereich: gleiches Sidemenü wie /admin.
import AccessGuard from "../admin/AccessGuard";
import VerwaltungShell from "../admin/VerwaltungShell";

export default function ReceiptsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <VerwaltungShell>
      <AccessGuard permissions="receipts.view" anywhere>
        {children}
      </AccessGuard>
    </VerwaltungShell>
  );
}
