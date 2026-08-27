// src/app/[lang]/components/WerkbereichMark.tsx — gezeichnete Werkstatt-Marke.
// Artwork nie unter 40px Höhe einsetzen (Untergrenze der Bibliothek).
// Bereiche ohne eigene Marke bekommen eine gesetzte Initiale in Fengardo Neue
// statt einer Lücke — die Karten bleiben so auf gleicher Höhe.
import type { Werkbereich } from "@/lib/werkbereiche";

type Props = {
  werkbereich: Pick<Werkbereich, "name" | "mark" | "markExt">;
  height?: number;
  className?: string;
};

export default function WerkbereichMark({
  werkbereich,
  height = 40,
  className,
}: Props) {
  const { name, mark, markExt = "svg" } = werkbereich;

  if (!mark) {
    return (
      <span
        aria-hidden="true"
        style={{ height, width: height, fontSize: Math.round(height * 0.58) }}
        className={`flex flex-none items-center justify-center border border-foreground font-display leading-none text-foreground${
          className ? ` ${className}` : ""
        }`}
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/branding/werkbereiche/${mark}.${markExt}`}
      alt={`Werkbereich ${name}`}
      style={{ height, width: "auto" }}
      className={`self-start object-contain${className ? ` ${className}` : ""}`}
    />
  );
}
