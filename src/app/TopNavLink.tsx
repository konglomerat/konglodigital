"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stripLocalePrefix } from "@/i18n/config";
import Badge from "@/components/knglmrt/Badge";
import Divider from "@/components/knglmrt/Divider";

import { isInternalHref, isTopNavSectionActive } from "./topNavSections";

type TopNavLinkProps = {
  href: string;
  label: string;
  newTab?: boolean;
  /** Noch in Arbeit: trägt die Marke „Coming Soon“. */
  comingSoon?: boolean;
};

export default function TopNavLink({
  href,
  label,
  newTab,
  comingSoon,
}: TopNavLinkProps) {
  const pathname = usePathname() ?? "/";
  const current =
    stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";
  const isActive = isTopNavSectionActive(current, href);
  const Element = isInternalHref(href) ? Link : "a";

  return (
    <Element
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      aria-current={isActive ? "page" : undefined}
      className="flex min-h-[70px] items-center gap-2 px-[18px] font-display text-[21px] text-foreground transition hover:text-primary"
    >
      <span className="relative inline-block w-max">
        <span className={isActive ? "font-bold text-primary" : undefined}>
          {label}
        </span>
        {isActive ? (
          <span className="absolute inset-x-0 top-full mt-1 block">
            <Divider number={4} height={8} color="var(--primary)" />
          </span>
        ) : null}
        {/* Sitzt als Marke an der oberen rechten Ecke des Titels und macht den
            Punkt nicht breiter. Bewusst unter der Tag-Stufe (12px). */}
        {comingSoon ? (
          <Badge
            tone="neu"
            compact
            className="pointer-events-none absolute right-0 top-0 -translate-y-[calc(50%+5px)] translate-x-1/3 whitespace-nowrap text-[9px]! leading-[11px]!"
          >
            Coming Soon
          </Badge>
        ) : null}
      </span>
    </Element>
  );
}
