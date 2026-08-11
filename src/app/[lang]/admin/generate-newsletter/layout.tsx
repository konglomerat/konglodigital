import ModuleAccessGuard from "../ModuleAccessGuard";

export default function GenerateNewsletterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleAccessGuard module="admin">{children}</ModuleAccessGuard>;
}
