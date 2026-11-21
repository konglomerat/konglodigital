// Marke eines Termins: die gezeichnete Werkbereich-Marke, und wo kein
// Bereich passt (Intro, Vereinstreffen), eines der vielen Gesichter.
import Face from "@/components/knglmrt/Face";
import { findArea } from "@/lib/workshops";
import WerkbereichMark from "../components/WerkbereichMark";

export default function WorkshopAreaMark({
  area,
  height = 40,
  className,
}: {
  area: string | null;
  height?: number;
  className?: string;
}) {
  const werkbereich = findArea(area);
  if (werkbereich) {
    return (
      <WerkbereichMark
        werkbereich={werkbereich}
        height={height}
        className={className}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center text-foreground${
        className ? ` ${className}` : ""
      }`}
      style={{ height, width: height }}
    >
      <Face number={6} size={height} title="" className="max-w-full" />
    </span>
  );
}
