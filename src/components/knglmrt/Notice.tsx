// Portiert aus knglmrt/components/ui/Notice.jsx — ohne die gezeichneten
// Gesichter, die im Repo (noch) nicht liegen. Bleibt ein Tint-Block ohne Rundung.
import type { ReactNode } from "react";

type NoticeTone = "rosa" | "gelb" | "blau" | "grau";

const TONE_CLASSNAME: Record<NoticeTone, string> = {
  rosa: "bg-primary-soft",
  gelb: "bg-warning-soft",
  blau: "bg-success-soft",
  grau: "bg-muted",
};

export default function Notice({
  children,
  title,
  tone = "rosa",
  className,
}: {
  children: ReactNode;
  title?: string;
  tone?: NoticeTone;
  className?: string;
}) {
  return (
    <div
      className={`px-[18px] py-4 ${TONE_CLASSNAME[tone]}${
        className ? ` ${className}` : ""
      }`}
    >
      {title ? (
        <div className="knglmrt-caption mb-1 text-[var(--knglmrt-brown-100)]">
          {title}
        </div>
      ) : null}
      <div className="text-foreground">{children}</div>
    </div>
  );
}
