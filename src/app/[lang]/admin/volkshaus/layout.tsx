import ModuleAccessGuard from "../ModuleAccessGuard";

export default function VolkshausAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleAccessGuard module="volkshaus">{children}</ModuleAccessGuard>;
}
