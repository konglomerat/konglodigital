// Portiert aus knglmrt/components/ui/Badge.jsx.
// Statusmarke: 10px Fira Sans, uppercase, getrackt, nie rund.
// Die Tonwerte sind die Tint-Stufen der Palette — das DS kennt kein Grün/Rot.
import type { ReactNode } from "react";

export type BadgeTone =
  | "offen" // pink-30
  | "wartet" // yellow-30
  | "gebucht" // blue-30
  | "neutral" // paper-grey
  | "neu" // yellow-30
  | "kontur"; // 1px schwarze Kontur

const TONE_CLASSNAME: Record<BadgeTone, string> = {
  offen: "bg-destructive-soft text-foreground",
  wartet: "bg-warning-soft text-foreground",
  gebucht: "bg-success-soft text-foreground",
  neutral: "bg-muted text-muted-foreground",
  neu: "bg-warning-soft text-foreground",
  kontur: "border border-foreground text-foreground",
};

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

export default function Badge({
  children,
  tone = "offen",
  className,
}: BadgeProps) {
  const padding = tone === "kontur" ? "px-1.5 py-0.5" : "px-[7px] py-[3px]";
  return (
    <span
      className={`knglmrt-tag inline-block ${padding} ${TONE_CLASSNAME[tone]}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </span>
  );
}
