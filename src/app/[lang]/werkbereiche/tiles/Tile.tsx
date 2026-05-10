type TileProps = {
  title: string;
  subtitle?: React.ReactNode;
  /** Optional link rendered to the right of the title. */
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
};

export default function Tile({ title, subtitle, action, children, className }: TileProps) {
  return (
    <section
      className={`flex h-full flex-col rounded-xl border border-border bg-card p-5 ${className ?? ""}`.trim()}
    >
      <header className="mb-4 flex items-start justify-between gap-3 border-b border-border/60 pb-3">
        <h2 className="text-xl font-black tracking-tight text-foreground md:text-2xl">
          {title}
        </h2>
        {action ? (
          <a
            href={action.href}
            className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            {action.label} ›
          </a>
        ) : null}
      </header>
      {subtitle ? (
        <div className="mb-4 text-sm font-medium text-muted-foreground">
          {subtitle}
        </div>
      ) : null}
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}
