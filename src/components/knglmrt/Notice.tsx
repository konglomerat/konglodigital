// Portiert aus knglmrt/components/ui/Notice.jsx. Ein Tint-Block ohne Rundung,
// auf Wunsch mit einem gezeichneten Gesicht davor — die Stimme des Hauses.
import type { ReactNode } from "react";

import Face from "./Face";

type NoticeTone = "rosa" | "gelb" | "blau" | "grau";

// Im DS trägt nur Rosa ein pinkes Gesicht, die übrigen Töne ein schwarzes.
const FACE_COLOR: Record<NoticeTone, string> = {
  rosa: "var(--knglmrt-pink-100)",
  gelb: "var(--knglmrt-ink)",
  blau: "var(--knglmrt-ink)",
  grau: "var(--knglmrt-ink)",
};

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
  faceNumber,
  className,
}: {
  children: ReactNode;
  title?: string;
  tone?: NoticeTone;
  faceNumber?: number;
  className?: string;
}) {
  const body = (
    <>
      {title ? (
        <div className="knglmrt-caption mb-1 text-[var(--knglmrt-brown-100)]">
          {title}
        </div>
      ) : null}
      <div className="text-foreground">{children}</div>
    </>
  );
  return (
    <div
      className={`px-[18px] py-4 ${TONE_CLASSNAME[tone]}${
        faceNumber ? " flex items-center gap-[14px]" : ""
      }${className ? ` ${className}` : ""}`}
    >
      {faceNumber ? (
        <>
          <span aria-hidden className="block flex-none">
            <Face number={faceNumber} size={42} color={FACE_COLOR[tone]} />
          </span>
          <div className="min-w-0">{body}</div>
        </>
      ) : (
        body
      )}
    </div>
  );
}
