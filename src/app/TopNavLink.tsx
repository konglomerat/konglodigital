"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { stripLocalePrefix } from "@/i18n/config";
import Divider from "@/components/knglmrt/Divider";

type TopNavLinkProps = {
  href: string;
  label: string;
};

export default function TopNavLink({ href, label }: TopNavLinkProps) {
  const pathname = usePathname() ?? "/";
  const current =
    stripLocalePrefix(pathname).pathname.replace(/\/+$/, "") || "/";
  const isActive = current === href || current.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className="flex items-center px-[18px] text-sm text-foreground transition hover:text-primary"
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
      </span>
    </Link>
  );
}
