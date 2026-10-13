import AccessGuard from "../../AccessGuard";

export default function VorstandAntraegeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccessGuard permissions="members.onboarding">{children}</AccessGuard>;
}
