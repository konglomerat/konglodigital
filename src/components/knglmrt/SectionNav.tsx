// Bereichsnavigation als eckige Chips — Muster aus dem Prototyp
// (Profil-Seite): aktiv = schwarze Fläche, sonst 1px Kontur.
import Link from "next/link";

export type SectionNavItem = {
  key: string;
  label: string;
  href: string;
};

export default function SectionNav({
  items,
  activeKey,
  ariaLabel,
  className,
}: {
  items: SectionNavItem[];
  activeKey: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-0.5${className ? ` ${className}` : ""}`}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "bg-foreground px-3 py-[5px] text-xs font-bold leading-4 text-background"
                : "knglmrt-border px-[11px] py-1 text-xs leading-4 text-foreground transition hover:bg-primary-soft"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
