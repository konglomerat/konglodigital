"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentPropsWithoutRef } from "react";

type ActiveNavLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  activeClassName?: string;
  exact?: boolean;
};

export default function ActiveNavLink({
  href,
  className,
  activeClassName = "text-primary",
  exact,
  ...props
}: ActiveNavLinkProps) {
  const pathname = usePathname();
  const hrefString = typeof href === "string" ? href : (href.pathname ?? "");
  const isRoot = hrefString === "/";
  const isActive = pathname
    ? exact
      ? pathname === hrefString
      : isRoot
        ? pathname === "/"
        : pathname === hrefString || pathname.startsWith(`${hrefString}/`)
    : false;
  const combinedClassName = [className, isActive ? activeClassName : ""]
    .filter(Boolean)
    .join(" ");

  return <Link href={href} className={combinedClassName} {...props} />;
}
