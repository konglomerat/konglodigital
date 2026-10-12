// src/app/[lang]/components/WerkbereichMark.tsx — gezeichnete Werkstatt-Marke.
// Artwork nie unter 40px Höhe einsetzen (Untergrenze der Bibliothek).
// Ein gemeinsamer Rahmen richtet schmale und breite Marken an derselben Achse
// aus. Bereiche ohne eigene Marke behalten ihre gesetzte Initiale.
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
  const frameClassName = `werkbereich-mark flex flex-none items-center justify-center${
    className ? ` ${className}` : ""
  }`;
  const frameStyle = { height, width: Math.ceil(height * 1.25) };

  if (!mark) {
    return (
      <span
        aria-hidden="true"
        style={frameStyle}
        className={frameClassName}
      >
        <span
          style={{ height, width: height, fontSize: Math.round(height * 0.58) }}
          className="flex items-center justify-center border border-current font-display leading-none"
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={frameClassName} style={frameStyle}>
      {/* Die Beschriftung steht neben der Marke; kein doppelter Linkname. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/branding/werkbereiche/${mark}.${markExt}`}
        alt=""
        style={{ height, maxWidth: "100%", width: "auto" }}
        className={`werkbereich-mark-image object-contain${
          mark === "laser" ? " werkbereich-mark-image-fine" : ""
        }`}
      />
    </span>
  );
}
