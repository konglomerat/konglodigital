// Portiert aus knglmrt/components/illustration/Divider.jsx.
// Eine der gezeichneten Linien des DS. Streckt sich auf die gegebene Breite.
import { DOODLE_LINES } from "./doodle-lines";

type DividerProps = {
  number?: number;
  width?: number | string;
  height?: number;
  color?: string;
  className?: string;
};

export default function Divider({
  number = 4,
  width = "100%",
  height,
  color = "currentColor",
  className,
}: DividerProps) {
  const doodle = DOODLE_LINES[`Lines${String(number).padStart(2, "0")}`];
  if (!doodle) return null;

  const viewBoxHeight = Number(doodle.viewBox.split(" ")[3]);

  return (
    <svg
      aria-hidden="true"
      viewBox={doodle.viewBox}
      preserveAspectRatio="none"
      width={width}
      height={height ?? viewBoxHeight}
      fill="none"
      className={className}
      style={{ color, display: "block" }}
      dangerouslySetInnerHTML={{ __html: doodle.body }}
    />
  );
}
