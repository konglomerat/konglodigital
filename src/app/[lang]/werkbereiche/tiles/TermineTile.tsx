import { WERKBEREICH_EVENTS } from "@/lib/werkbereiche";
import Tile from "./Tile";

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

function getUpcomingForTag(tag: string, limit: number) {
  const todayIso = new Date().toISOString().slice(0, 10);
  return WERKBEREICH_EVENTS.filter(
    (e) => e.tag === tag && e.date >= todayIso,
  )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export default function TermineTile({ tag }: { tag: string }) {
  const events = getUpcomingForTag(tag, 5);

  return (
    <Tile
      title="Nächste Termine"
      action={{ href: "/calendar", label: "Alle Termine" }}
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aktuell keine geplanten Termine.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {events.map((e) => {
            const d = new Date(`${e.date}T00:00:00`);
            return (
              <li
                key={`${e.date}-${e.title}`}
                className="grid grid-cols-[124px_minmax(0,1fr)] items-center gap-3 py-2 text-sm"
              >
                <div className="tabular-nums whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {weekdayFormatter.format(d)} {dateFormatter.format(d)}
                </div>
                <div className="truncate whitespace-nowrap font-medium text-foreground">
                  {e.title}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Tile>
  );
}
