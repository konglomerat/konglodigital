"use client";
// Einmalige Tour nach dem großen UI-Update: zeigt, wo Buchhaltung & Co.
// (Verwaltung) und die Self-Services (Mitgliederbereich) jetzt liegen. Ziele
// sind die Elemente mit `data-tour="…"` in TopNav und MobileTopNav — es zählt
// jeweils das sichtbare. Unter 1024px führt ein Schritt vorweg ins Menü.
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import Button from "@/components/knglmrt/Button";
import Face from "@/components/knglmrt/Face";
import { useI18n } from "@/i18n/client";

type StepId = "menu" | "verwaltung" | "profil";

type NavTourProps = {
  /** Ohne Ressort der Verwaltung entfällt der Schritt zum Verwaltung-Knopf. */
  hasAdminAccess: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
};

const DESKTOP_QUERY = "(min-width: 1024px)";

// Abstand des Rings um das Ziel, wie im Design; negativ heißt innen.
const RING_OFFSET: Record<"desktop" | "mobile", Record<StepId, number>> = {
  desktop: { menu: -5, verwaltung: 3, profil: 5 },
  mobile: { menu: -5, verwaltung: 3, profil: 4 },
};

const MITGLIEDERBEREICH_ITEMS = [
  "Persönliche Daten",
  "Zugangskarte",
  "Ehrenamtsbonus",
  "Belege & Rechnungen",
];

function subscribeToDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const subscribeToNothing = () => () => {};

function findVisibleTarget(id: StepId) {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`),
  ).find((element) => element.getClientRects().length > 0);
}

// Mobil hängen die Schritte nach dem ersten am offenen Menü: Ist es zu, steht
// die Tour auf „Menü“, geht es auf, rückt sie von dort selbst weiter.
function resolveStep(
  step: StepId | null,
  steps: StepId[],
  isDesktop: boolean,
  menuOpen: boolean,
): StepId {
  if (!isDesktop) {
    if (!menuOpen) return "menu";
    if (!step || step === "menu" || !steps.includes(step)) return steps[1];
    return step;
  }
  return step && steps.includes(step) ? step : steps[0];
}

// „<b>Verwaltung</b>“ in einer übersetzbaren Zeile fett setzen.
function withBold(text: string) {
  return text.split(/<b>(.*?)<\/b>/).map((part, index) =>
    index % 2 ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>,
  );
}

export default function NavTour({
  hasAdminAccess,
  menuOpen,
  onMenuOpenChange,
}: NavTourProps) {
  const { tx } = useI18n();
  const titleId = useId();
  const onClient = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
  const [seen, setSeen] = useState(false);
  const [step, setStep] = useState<StepId | null>(null);
  const [previousMenuOpen, setPreviousMenuOpen] = useState(menuOpen);

  const popoverRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  const steps: StepId[] = [
    ...(isDesktop ? [] : ["menu" as const]),
    ...(hasAdminAccess ? ["verwaltung" as const] : []),
    "profil",
  ];
  const current = resolveStep(step, steps, isDesktop, menuOpen);
  const index = steps.indexOf(current);
  const mode = isDesktop ? "desktop" : "mobile";
  const isOpen = onClient && !seen;

  // Schließt jemand mobil das Menü mitten in der Tour, ist sie vorbei.
  if (previousMenuOpen !== menuOpen) {
    setPreviousMenuOpen(menuOpen);
    if (
      isOpen &&
      !isDesktop &&
      !menuOpen &&
      resolveStep(step, steps, isDesktop, true) !== "menu"
    ) {
      setSeen(true);
    }
  }

  // Gemerkt wird im Supabase-Profil (user_metadata.nav_tour_seen), das Layout
  // liest es beim nächsten Laden. Schlägt das fehl, kommt die Tour halt wieder.
  useEffect(() => {
    if (!seen) return;
    void fetch("/api/account/nav-tour", { method: "POST" }).catch(() => {});
  }, [seen]);

  const finish = () => {
    setSeen(true);
    if (!isDesktop && menuOpen) onMenuOpenChange(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    popoverRef.current
      ?.querySelector<HTMLElement>("[data-tour-primary]")
      ?.focus({ preventScroll: true });
  }, [isOpen, current]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSeen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  // Popover, Pfeil und Ring hängen am sichtbaren Ziel und wandern bei Scroll
  // und Größenänderung mit. Geschrieben wird direkt ins style — kein State,
  // sonst rendert jede Scrollbewegung die Tour neu.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const target = findVisibleTarget(current);
    target?.scrollIntoView({ block: "nearest" });

    const place = () => {
      const popover = popoverRef.current;
      const arrow = arrowRef.current;
      const ring = ringRef.current;
      const element = findVisibleTarget(current);
      if (!popover || !arrow || !ring) return;
      if (!element) {
        popover.style.visibility = "hidden";
        ring.style.visibility = "hidden";
        return;
      }

      const rect = element.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const edge = 16;
      const gap = isDesktop ? 18 : 12;
      const width = isDesktop
        ? Math.min(360, viewportWidth - 2 * edge)
        : viewportWidth - 2 * edge;
      const centerX = rect.left + rect.width / 2;
      // Der Pfeil sitzt rechts im Popover, das Popover selbst links vom Ziel.
      const left = Math.min(
        Math.max(isDesktop ? centerX - width + 80 : edge, edge),
        viewportWidth - edge - width,
      );
      // Erst die Breite, dann messen — die Höhe hängt vom Umbruch ab.
      popover.style.width = `${width}px`;
      const height = popover.offsetHeight;
      const below = rect.bottom + gap;
      const flip =
        below + height > viewportHeight - edge &&
        rect.top - gap - height > edge;

      popover.style.visibility = "visible";
      popover.style.left = `${left}px`;
      popover.style.top = `${flip ? rect.top - gap - height : below}px`;

      arrow.style.left = `${Math.min(Math.max(centerX - left - 7, 12), width - 26)}px`;
      arrow.style.top = flip ? "auto" : "-8px";
      arrow.style.bottom = flip ? "-8px" : "auto";
      arrow.style.transform = `rotate(${flip ? 225 : 45}deg)`;

      const offset = RING_OFFSET[mode][current];
      ring.style.visibility = "visible";
      ring.style.left = `${rect.left}px`;
      ring.style.top = `${rect.top}px`;
      ring.style.width = `${rect.width}px`;
      ring.style.height = `${rect.height}px`;
      ring.style.outlineOffset = `${offset}px`;
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen, current, isDesktop, mode, menuOpen]);

  if (!isOpen) return null;

  const isLast = index === steps.length - 1;
  const previous = index > 0 ? steps[index - 1] : null;
  const faceSize = isDesktop ? 52 : 44;

  const content: Record<
    StepId,
    { kicker: string; title: string; face: number; text: string; info: ReactNode }
  > = {
    menu: {
      kicker: tx("Neue Navigation"),
      title: tx("Alles steckt im Menü"),
      face: 9,
      text: tx(
        "Das Seitenmenü gibt’s nicht mehr. Die <b>Verwaltung</b> und dein Mitgliederbereich findest du jetzt hier oben im Menü.",
      ),
      info: null,
    },
    verwaltung: {
      kicker: tx("Neu sortiert"),
      title: tx("Buchhaltung gesucht?"),
      face: 14,
      text: isDesktop
        ? tx(
            "Die Buchhaltung und andere interne Tools sind aus dem Seitenmenü in den neuen Bereich <b>Verwaltung</b> gezogen – hier oben, neben deinem Namen.",
          )
        : tx(
            "Die Buchhaltung und andere interne Tools sind aus dem Seitenmenü in den neuen Bereich <b>Verwaltung</b> gezogen – hier im Menü, unter deinem Namen.",
          ),
      info: (
        <div className="flex flex-col gap-0.5 bg-primary-soft px-3 py-2.5 text-[13px] leading-[18px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-primary">
            {tx("Hinweis")}
          </span>
          <span className="text-pretty">
            {tx(
              "Die Rollenzuweisung entscheidet, welche Tools dir da angezeigt werden. Falls mal was fehlt, sag bitte Bescheid.",
            )}
          </span>
        </div>
      ),
    },
    profil: {
      kicker: tx("Neu"),
      title: tx("Dein Mitgliederbereich"),
      face: 22,
      text: isDesktop
        ? tx(
            "Klick auf deinen Namen: Dort findest du deine persönlichen Daten und alle Self-Services an einem Ort.",
          )
        : tx(
            "Tipp auf deinen Namen: Dort findest du deine persönlichen Daten und alle Self-Services an einem Ort.",
          ),
      info: (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 bg-primary-soft px-3 py-2.5 font-mono text-[11px] leading-4">
          {MITGLIEDERBEREICH_ITEMS.map((item) => (
            <li key={item}>{tx(item)}</li>
          ))}
        </ul>
      ),
    },
  };
  const { kicker, title, face, text, info } = content[current];

  return createPortal(
    <>
      <div
        ref={ringRef}
        aria-hidden="true"
        className="pointer-events-none fixed z-50 outline-2 outline-primary outline-solid"
        style={{ visibility: "hidden" }}
      />
      <div
        ref={popoverRef}
        role="dialog"
        aria-labelledby={titleId}
        className="fixed z-50 knglmrt-border bg-card text-foreground shadow-[3px_3px_0_var(--hairline-color)]"
        style={{ visibility: "hidden" }}
      >
        <div
          ref={arrowRef}
          aria-hidden="true"
          className="absolute h-3.5 w-3.5 border-l border-t border-[var(--hairline-color)] bg-card"
        />
        <div
          key={current}
          className={`flex flex-col gap-3 motion-safe:animate-[nav-tour-fade_200ms_cubic-bezier(0.2,0,0,1)] ${
            isDesktop ? "px-[22px] pb-[18px] pt-[22px]" : "px-[18px] pb-4 pt-[18px]"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-primary">
                {kicker}
              </div>
              <h2 id={titleId} className="font-display text-[23px] font-normal leading-[26px]">
                {title}
              </h2>
            </div>
            <Face number={face} size={faceSize} color="var(--primary)" className="flex-none" />
          </div>
          <p className="text-pretty text-[13px] leading-[18px]">{withBold(text)}</p>
          {info}
          <div className={`flex items-center gap-2 ${isDesktop ? "pt-1" : ""}`}>
            <span className="flex-1 font-mono text-[11px] text-muted-foreground">
              {index + 1} / {steps.length}
            </span>
            {previous && previous !== "menu" ? (
              <Button kind="quiet" size="chip" className="min-h-9 px-4" onClick={() => setStep(previous)}>
                {tx("Zurück")}
              </Button>
            ) : null}
            <Button
              data-tour-primary
              kind="primary"
              size="chip"
              className="min-h-9 px-4"
              onClick={() => {
                if (current === "menu") onMenuOpenChange(true);
                else if (isLast) finish();
                else setStep(steps[index + 1]);
              }}
            >
              {current === "menu" ? tx("Menü öffnen") : isLast ? tx("Fertig") : tx("Weiter")}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
