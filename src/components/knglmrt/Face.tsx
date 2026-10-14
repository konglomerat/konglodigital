// Portiert aus knglmrt/components/illustration/Face.jsx.
// Eines der gezeichneten Gesichter — die "vielen Gesichter" des Vereins.
// Die Höhe führt, die Breite folgt dem Seitenverhältnis der viewBox.
import { DOODLE_FIGURES } from "./doodle-figures";

type FaceProps = {
  number?: number;
  size?: number;
  color?: string;
  flip?: boolean;
  title?: string;
  className?: string;
};

export default function Face({
  number = 19,
  size = 76,
  color = "currentColor",
  flip = false,
  title = "Gesicht",
  className,
}: FaceProps) {
  const doodle = DOODLE_FIGURES[`Faces${String(number).padStart(2, "0")}`];
  if (!doodle) return null;

  const [, , viewWidth, viewHeight] = doodle.viewBox.split(" ").map(Number);

  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={doodle.viewBox}
      height={size}
      width={(size * viewWidth) / viewHeight}
      fill="none"
      className={className}
      style={{
        color,
        display: "block",
        transform: flip ? "scaleX(-1)" : undefined,
      }}
      dangerouslySetInnerHTML={{ __html: doodle.body }}
    />
  );
}
