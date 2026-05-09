type WerkbereichTemplateProps = {
  title: string;
  /** Times for "Offene Werkstatt". */
  hoursLabel?: string;
  /** Optional eyebrow above the title (e.g. "Werkbereich" or "Projekt"). */
  kicker?: string;
  /** Short description shown above the content area. */
  description?: React.ReactNode;
  /** Content modules go here. */
  children?: React.ReactNode;
};

const TOOL_PLACEHOLDERS = 4;

export default function WerkbereichTemplate({
  title,
  hoursLabel,
  kicker = "Werkbereich",
  description,
  children,
}: WerkbereichTemplateProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Full-bleed header bar */}
      <div className="-mx-3 -mt-4 bg-foreground px-6 py-5 text-background md:-mx-10 md:-mt-10 md:px-10 md:py-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-background/60">
          {kicker}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">
            {title}
          </h1>
          {hoursLabel ? (
            <div className="text-sm text-background/80">
              <span className="font-semibold">Offene Werkstatt:</span>{" "}
              {hoursLabel}
            </div>
          ) : null}
        </div>
      </div>

      {/* Tools row (placeholder tiles) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Tools
        </span>
        {Array.from({ length: TOOL_PLACEHOLDERS }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="inline-flex h-7 w-24 items-center rounded-full border border-dashed border-border bg-muted/30"
          />
        ))}
      </div>

      {/* Kurzbeschreibung */}
      {description ? (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Kurzbeschreibung
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-foreground">
            {description}
          </p>
        </div>
      ) : null}

      {/* Content area: tiles when children, placeholder otherwise */}
      {children ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
      ) : (
        <div className="min-h-[40vh] rounded-xl border border-dashed border-border bg-card/40 p-6">
          <p className="text-sm text-muted-foreground">Inhalte folgen.</p>
        </div>
      )}
    </div>
  );
}
