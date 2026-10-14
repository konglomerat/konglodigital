import AccessGuard from "../admin/AccessGuard";

// Materialbestellungen werden als Rechnungen in Campai gebucht — das ist
// Buchhaltung.
export default function MaterialbestellungLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AccessGuard permissions="receipts.edit" anywhere>
      {children}
    </AccessGuard>
  );
}
