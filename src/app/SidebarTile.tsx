"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarTileProps = {
  href: string;
  label: string;
  /** Match active state when the pathname starts with this prefix. Defaults to href. */
  activeMatch?: string;
};

export default function SidebarTile({
  href,
  label,
  activeMatch,
}: SidebarTileProps) {
  const pathname = usePathname() ?? "";
  const match = activeMatch ?? href;
  const isActive =
    match !== "#" &&
    (pathname === match ||
      pathname.startsWith(`${match}/`) ||
      pathname.endsWith(match) ||
      pathname.includes(`${match}/`));

  return (
    <Link
      href={href}
      className={[
        "block truncate rounded-md border px-2 py-1.5 text-center text-[10.5px] font-semibold leading-tight transition",
        isActive
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-muted/40 text-foreground hover:bg-muted",
      ].join(" ")}
      title={label}
    >
      {label}
    </Link>
  );
}
