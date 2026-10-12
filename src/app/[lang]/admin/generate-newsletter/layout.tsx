import ModuleAccessGuard from "../ModuleAccessGuard";

export default function GenerateNewsletterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleAccessGuard module="volkshaus">{children}</ModuleAccessGuard>;
}
