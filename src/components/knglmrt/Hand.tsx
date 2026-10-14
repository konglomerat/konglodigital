// Portiert aus knglmrt/components/illustration/Hand.jsx.
// Eine der gezeichneten Hände — machen, halten, zeigen.
// Die Höhe führt, die Breite folgt dem Seitenverhältnis der viewBox.
import { DOODLE_FIGURES } from "./doodle-figures";

type HandProps = {
  number?: number;
  size?: number;
  color?: string;
  flip?: boolean;
  title?: string;
  className?: string;
};

export default function Hand({
  number = 4,
  size = 76,
  color = "currentColor",
  flip = false,
  title = "Hand",
  className,
}: HandProps) {
  const doodle = DOODLE_FIGURES[`Hands${String(number).padStart(2, "0")}`];
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
