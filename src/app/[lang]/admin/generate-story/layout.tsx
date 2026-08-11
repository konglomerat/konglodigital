import ModuleAccessGuard from "../ModuleAccessGuard";

export default function GenerateStoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModuleAccessGuard module="admin">{children}</ModuleAccessGuard>;
}
