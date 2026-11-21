import AccessGuard from "../AccessGuard";

export default function GenerateNewsletterLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccessGuard permissions="newsletter.manage">{children}</AccessGuard>;
}
