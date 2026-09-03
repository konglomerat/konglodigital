// Portiert aus knglmrt/components/illustration/Divider.jsx.
// Eine der sechs gezeichneten Linien des DS.
//
// Gerendert als CSS-Maske über einer Farbfläche: die Linie nimmt jede Farbe an
// (currentColor, var(--primary), …), die Pfaddaten bleiben aber aus dem Bundle.
import {
  DOODLE_LINES,
  type DoodleLineNumber,
} from "./doodle-lines";

type DividerProps = {
  /** 1–6, siehe DOODLE_LINES. 4 ist der ruhigste Strich. */
  number?: DoodleLineNumber;
  width?: number | string;
  height?: number;
  color?: string;
  /**
   * Statt die Linie auf die volle Breite zu strecken, sie in Originalbreite
   * kacheln. Sinnvoll für die gepunktete/gestrichelte Linie (5, 6), damit die
   * Punktabstände auf jeder Breite gleich bleiben.
   */
  repeat?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function Divider({
  number = 4,
  width = "100%",
  height,
  color = "currentColor",
  repeat = false,
  className,
  style,
}: DividerProps) {
  const line = DOODLE_LINES[number];
  if (!line) return null;

  const mask = `url("${line.src}")`;
  const resolvedHeight = height ?? line.height;

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        width,
        height: resolvedHeight,
        backgroundColor: color,
        maskImage: mask,
        WebkitMaskImage: mask,
        maskRepeat: repeat ? "repeat-x" : "no-repeat",
        WebkitMaskRepeat: repeat ? "repeat-x" : "no-repeat",
        maskSize: repeat ? "auto 100%" : "100% 100%",
        WebkitMaskSize: repeat ? "auto 100%" : "100% 100%",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        ...style,
      }}
    />
  );
}
