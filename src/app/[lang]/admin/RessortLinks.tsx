import Link from "next/link";

export type RessortLink = {
  href?: string;
  label: string;
  description?: string;
  comingSoon?: boolean;
};

const tileClassName =
  "flex flex-col gap-1.5 knglmrt-border bg-card p-[18px]";

export default function RessortLinks({ links }: { links: RessortLink[] }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) =>
        link.comingSoon || !link.href ? (
          <div
            key={link.label}
            aria-disabled="true"
            className={`${tileClassName} cursor-not-allowed select-none border-border text-muted-foreground/80`}
          >
            <span className="flex items-center gap-2">
              <span className="knglmrt-card-title">{link.label}</span>
              <span className="whitespace-nowrap border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Soon
              </span>
            </span>
            {link.description ? <span>{link.description}</span> : null}
          </div>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            className={`${tileClassName} transition hover:bg-primary-soft`}
          >
            <span className="knglmrt-card-title">{link.label}</span>
            {link.description ? (
              <span className="text-muted-foreground">{link.description}</span>
            ) : null}
          </Link>
        ),
      )}
    </div>
  );
}
