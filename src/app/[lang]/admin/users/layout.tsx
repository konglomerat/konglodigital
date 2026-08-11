import ModuleAccessGuard from "../ModuleAccessGuard";

export default function AdminUsersLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleAccessGuard module="admin">{children}</ModuleAccessGuard>;
}
