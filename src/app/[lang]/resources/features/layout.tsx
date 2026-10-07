import AccessGuard from "../../admin/AccessGuard";

// Der Editor bearbeitet Inventar — nur mit resources.edit.
export default function ResourceFeaturesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccessGuard permissions="resources.edit">{children}</AccessGuard>;
}
