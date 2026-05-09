import Link from "next/link";
import Tile from "./Tile";

const LINKS: { label: string; href: string; hint?: string }[] = [
  {
    label: "Einweisung buchen",
    href: "/calendar",
    hint: "Termine im Kalender",
  },
  { label: "Sicherheitsregeln", href: "#", hint: "Vor dem ersten Mal lesen" },
  { label: "Material & Preise", href: "#", hint: "Was kostet was" },
  { label: "Hilfe & Support", href: "#", hint: "Werkstattleitung erreichen" },
];

export default function WichtigsteLinksTile() {
  return (
    <Tile title="Wichtigste Links">
      <ul className="divide-y divide-border/60">
        {LINKS.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="flex items-center gap-3 py-2.5 text-sm transition hover:text-primary"
            >
              <span className="flex-1">
                <span className="block font-semibold text-foreground">
                  {link.label}
                </span>
                {link.hint ? (
                  <span className="block text-xs text-muted-foreground">
                    {link.hint}
                  </span>
                ) : null}
              </span>
              <span aria-hidden className="text-muted-foreground">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Tile>
  );
}
