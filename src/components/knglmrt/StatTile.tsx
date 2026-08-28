// Portiert aus knglmrt/components/ui/StatTile.jsx.
// Eine Zahl, ein Label, optional ein Balken. Die Zahl läuft in Fira Mono.
type StatTileProps = {
  label: string;
  value: string;
  hint?: string;
  /** 0–100. Nur gesetzt, wenn es wirklich einen Verbrauch gibt. */
  percent?: number;
  tone?: "weiss" | "grau" | "rosa";
  className?: string;
};

const TONE_SURFACE: Record<NonNullable<StatTileProps["tone"]>, string> = {
  weiss: "bg-card",
  grau: "bg-muted",
  rosa: "bg-primary-soft",
};

export default function StatTile({
  label,
  value,
  hint,
  percent,
  tone = "weiss",
  className,
}: StatTileProps) {
  const isRosa = tone === "rosa";
  const bar = Math.max(0, Math.min(100, percent ?? 0));

  return (
    <div
      className={`flex flex-col gap-[5px] px-[18px] py-4 ${TONE_SURFACE[tone]}${
        tone === "weiss" ? " knglmrt-border" : ""
      }${className ? ` ${className}` : ""}`}
    >
      <span
        className={`knglmrt-caption ${
          isRosa ? "text-[var(--knglmrt-brown-100)]" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <span
        className={`knglmrt-value ${isRosa ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </span>
      {percent === undefined ? null : (
        <span className="block h-3 bg-muted">
          <span className="block h-3 bg-primary" style={{ width: `${bar}%` }} />
        </span>
      )}
      {hint ? (
        <span
          className={`font-num text-[11px] leading-[15px] ${
            isRosa ? "text-[var(--knglmrt-brown-100)]" : "text-muted-foreground"
          }`}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
