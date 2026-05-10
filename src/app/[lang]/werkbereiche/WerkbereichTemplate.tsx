import Link from "next/link";

type WerkbereichToolLink = {
  href?: string;
  label: string;
  disabled?: boolean;
};

type WerkbereichTemplateProps = {
  title: string;
  /** Times for "Offene Werkstatt". */
  hoursLabel?: string;
  /** Optional eyebrow above the title (e.g. "Werkbereich" or "Projekt"). */
  kicker?: string;
  /** Short description shown above the content area. */
  description?: React.ReactNode;
  /** Optional links shown in the tools row. */
  tools?: WerkbereichToolLink[];
  /** Content modules go here. */
  children?: React.ReactNode;
};

const TOOL_PLACEHOLDERS = 4;

export default function WerkbereichTemplate({
  title,
  hoursLabel,
  kicker = "Werkbereich",
  description,
  tools,
  children,
}: WerkbereichTemplateProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Full-bleed header bar */}
      <div
        className="-mx-3 -mt-4 bg-cover bg-center bg-no-repeat px-6 py-5 text-background md:-mx-10 md:-mt-10 md:px-10 md:py-6"
        style={{
          backgroundBlendMode: "color",
          backgroundColor: "rgb(0 41 177)",
          backgroundImage: "url('/branding/KNGLMRT_HG_grob_a.svg')",
        }}
      >
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-background/70">
          {kicker}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">
            {title}
          </h1>
          {hoursLabel ? (
            <div className="text-sm font-semibold text-background/85">
              <span className="font-black">Offene Werkstatt:</span>{" "}
              {hoursLabel}
            </div>
          ) : null}
        </div>
      </div>

      {/* Tools row (placeholder tiles) */}
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Tools
        </div>
        <div className="flex flex-wrap gap-3">
          {tools && tools.length > 0
            ? tools.map((tool) => {
                const className = tool.disabled || !tool.href
                  ? "inline-flex min-h-11 min-w-32 cursor-default items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm font-semibold text-muted-foreground"
                  : "inline-flex min-h-11 min-w-32 items-center justify-center rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-muted";

                return tool.disabled || !tool.href ? (
                  <span key={tool.label} aria-disabled="true" className={className}>
                    {tool.label}
                  </span>
                ) : (
                  <Link key={tool.href} href={tool.href} className={className}>
                    {tool.label}
                  </Link>
                );
              })
            : Array.from({ length: TOOL_PLACEHOLDERS }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="inline-flex h-11 w-32 items-center rounded-xl border border-dashed border-border bg-muted/30"
                />
              ))}
        </div>
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">{children}</div>
      ) : (
        <div className="min-h-[40vh] rounded-xl border border-dashed border-border bg-card/40 p-6">
          <p className="text-sm text-muted-foreground">Inhalte folgen.</p>
        </div>
      )}
    </div>
  );
}
