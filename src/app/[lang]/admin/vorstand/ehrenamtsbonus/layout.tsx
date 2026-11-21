import AccessGuard from "../../AccessGuard";

export default function VorstandEhrenamtsbonusLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AccessGuard permissions="ehrenamtsbonus.manage">{children}</AccessGuard>
  );
}
