import AccessGuard from "../admin/AccessGuard";
import VerwaltungShell from "../admin/VerwaltungShell";

// Materialbestellungen werden als Rechnungen in Campai gebucht — das ist
// Buchhaltung. Erreichbar über Verwaltung → Holzwerkstatt, daher mit
// derselben Sidenav.
export default function MaterialbestellungLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <VerwaltungShell>
      <AccessGuard permissions="receipts.edit" anywhere>
        {children}
      </AccessGuard>
    </VerwaltungShell>
  );
}
