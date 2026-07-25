"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentPropsWithoutRef } from "react";

type ActiveNavLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  activeClassName?: string;
  activePrefixes?: string[];
  exact?: boolean;
};

export default function ActiveNavLink({
  href,
  className,
  activeClassName = "text-primary",
  activePrefixes = [],
  exact,
  ...props
}: ActiveNavLinkProps) {
  const pathname = usePathname();
  const hrefString = typeof href === "string" ? href : (href.pathname ?? "");
  const isRoot = hrefString === "/";
  const matchesPrefix = (prefix: string) =>
    prefix === "/"
      ? pathname === "/"
      : pathname === prefix || pathname?.startsWith(`${prefix}/`);
  const isActive = pathname
    ? activePrefixes.some(matchesPrefix) ||
      (exact
        ? pathname === hrefString
        : isRoot
          ? pathname === "/"
          : pathname === hrefString || pathname.startsWith(`${hrefString}/`))
    : false;
  const combinedClassName = [className, isActive ? activeClassName : ""]
    .filter(Boolean)
    .join(" ");

  return <Link href={href} className={combinedClassName} {...props} />;
}
