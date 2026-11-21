import AccessGuard from "../AccessGuard";

export default function GenerateStoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccessGuard permissions="stories.manage">{children}</AccessGuard>;
}
