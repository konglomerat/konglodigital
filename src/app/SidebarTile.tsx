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
        "sidebar-tile",
        isActive
          ? "sidebar-tile--active"
          : "sidebar-tile--inactive",
      ].join(" ")}
      title={label}
    >
      {label}
    </Link>
  );
}
