"use client";

// src/app/[lang]/account/AccountSideNav.tsx — das kleine Menü links neben den
// Rubriken der Kontoseite.
//
// Es springt per Anker zur Rubrik und markiert die, die gerade oben im Bild
// steht. Auf schmalen Bildschirmen fällt es weg — dort ist die Seite ohnehin
// eine einzige Spalte, die man durchscrollt.
import { useEffect, useState } from "react";

export type AccountNavItem = {
  /** Die `id` der Rubrik auf der Seite. */
  id: string;
  label: string;
};

// So weit unter dem Fensterrand gilt eine Rubrik als „oben": knapp unter dem
// klebenden Seitenkopf, passend zu `scroll-mt` an den Rubriken.
const ACTIVE_OFFSET = 120;

export default function AccountSideNav({ items }: { items: AccountNavItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const update = () => {
      // Aktiv ist die letzte Rubrik, deren Oberkante schon über der Marke liegt.
      // Am Seitenende gewinnt die letzte — sonst käme eine kurze Schlussrubrik
      // nie an die Reihe.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= ACTIVE_OFFSET) {
          current = item.id;
        }
      }
      if (atBottom && items.length > 0) {
        current = items[items.length - 1].id;
      }
      setActiveId(current);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items]);

  return (
    <nav aria-label="Bereiche des Kontos" className="hidden md:block">
      <ul className="sticky top-[96px] m-0 flex list-none flex-col gap-0.5 p-0">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                className={`block border-l-2 py-1.5 pl-3 text-[15px] leading-5 transition-colors ${
                  active
                    ? "border-primary font-bold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
