import AccessGuard from "../../admin/AccessGuard";

// Buchen darf, wer Buchhaltung global oder für mindestens einen Bereich hat;
// die Kostenstelle selbst prüft die API.
export default function ReceiptsEditLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AccessGuard permissions="receipts.edit" anywhere>
      {children}
    </AccessGuard>
  );
}
