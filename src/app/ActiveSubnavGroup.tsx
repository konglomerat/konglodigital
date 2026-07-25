"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type ActiveSubnavGroupProps = {
  activePrefixes: string[];
  children: ReactNode;
  className?: string;
};

export default function ActiveSubnavGroup({
  activePrefixes,
  children,
  className,
}: ActiveSubnavGroupProps) {
  const pathname = usePathname();
  const isActive = activePrefixes.some((prefix) =>
    prefix === "/"
      ? pathname === "/"
      : pathname === prefix || pathname?.startsWith(`${prefix}/`),
  );

  if (!isActive) {
    return null;
  }

  return <div className={className}>{children}</div>;
}
