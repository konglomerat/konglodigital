import AccessGuard from "../AccessGuard";

export default function AdminContactsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccessGuard permissions="contacts.manage">{children}</AccessGuard>;
}
