type TileProps = {
  title: string;
  /** Optional link rendered to the right of the title. */
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
};

export default function Tile({ title, action, children, className }: TileProps) {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`.trim()}
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h2>
        {action ? (
          <a
            href={action.href}
            className="text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
          >
            {action.label} ›
          </a>
        ) : null}
      </header>
      {children}
    </section>
  );
}
