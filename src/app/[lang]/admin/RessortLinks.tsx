import Link from "next/link";

export type RessortLink = {
  href?: string;
  label: string;
  description?: string;
  comingSoon?: boolean;
};

// Immer mindestens zwei Spalten — auch auf dem Telefon, wo die Kacheln dafür
// enger sitzen, kleiner setzen und ohne Beschreibung auskommen. Ab lg stehen
// sie in einer Reihe und teilen sich die Breite zu gleichen Teilen. Der
// Schatten ist der Betonungsschatten des Systems, derselbe wie an Dialog und
// Primärknopf.
const tileClassName =
  "flex flex-col gap-1 knglmrt-border knglmrt-emphasis-shadow bg-card p-2.5 sm:gap-1.5 sm:p-[18px] lg:min-w-0 lg:flex-1 lg:basis-0";

// Wie knglmrt-card-title, nur eine Stufe kleiner auf dem Telefon. Die
// DS-Klasse selbst lässt sich nicht per sm: schalten — sie liegt nicht in
// Tailwinds Utility-Layer.
const titleClassName =
  "font-bold text-[length:var(--ui-size-field)] leading-[var(--ui-line-field)] sm:text-[length:var(--ui-size-card)] sm:leading-[var(--ui-line-card)]";

export default function RessortLinks({ links }: { links: RessortLink[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3.5 lg:flex lg:flex-nowrap lg:items-stretch">
      {links.map((link) =>
        link.comingSoon || !link.href ? (
          <div
            key={link.label}
            aria-disabled="true"
            className={`${tileClassName} cursor-not-allowed select-none border-border text-muted-foreground/80`}
          >
            <span className="flex items-center gap-2">
              <span className={titleClassName}>{link.label}</span>
              <span className="knglmrt-tag whitespace-nowrap border border-border px-1.5 py-0.5">
                Soon
              </span>
            </span>
            {link.description ? (
              <span className="hidden sm:block">{link.description}</span>
            ) : null}
          </div>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            className={`${tileClassName} transition hover:bg-primary-soft`}
          >
            <span className={titleClassName}>{link.label}</span>
            {link.description ? (
              <span className="hidden text-muted-foreground sm:block">
                {link.description}
              </span>
            ) : null}
          </Link>
        ),
      )}
    </div>
  );
}
