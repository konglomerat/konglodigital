import ModuleAccessGuard from "../ModuleAccessGuard";

export default function AdminContactsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleAccessGuard module="admin">{children}</ModuleAccessGuard>;
}
