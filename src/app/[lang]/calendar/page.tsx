import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import PageTitle from "../components/PageTitle";
import {
  CALENDAR_URL,
  buildDays,
  extractTags,
  getDayKey,
  getTimeRange,
  getUpcomingEvents,
  tagIconMap,
  type CalendarEvent,
} from "./calendar-data";

export const revalidate = 300;
export const runtime = "nodejs";

export default async function CalendarPage() {
  let events: CalendarEvent[] = [];
  let errorMessage: string | null = null;

  try {
    events = await getUpcomingEvents();
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Kalender konnte nicht geladen werden.";
  }

  const now = new Date();
  const days = buildDays(now);

  for (const event of events) {
    const dayKey = getDayKey(event.start);
    const day = days.find((entry) => entry.key === dayKey);
    if (day) {
      day.events.push(event);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="Kalender"
        title="Nächste 7 Tage"
        subTitle="Übersicht aller Termine im Google Kalender."
        links={[
          {
            href: CALENDAR_URL,
            label: "Google Kalender öffnen",
            target: "_blank",
            rel: "noreferrer",
            size: "medium",
            className:
              "rounded-full border-primary text-primary hover:border-primary hover:bg-primary-soft hover:text-primary",
          },
        ]}
      />

      {errorMessage ? (
        <div className="rounded-2xl border border-destructive-border bg-destructive-soft p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4">
        {days.map((day) => (
          <section
            key={day.key}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {day.label}
              </h2>
            </div>
            <ul className="mt-3 divide-y divide-border/20">
              {day.events.length === 0 ? (
                <li className="py-3 text-sm text-muted-foreground">
                  Leider keine Termine
                </li>
              ) : (
                day.events.map((event) => {
                  const tags = extractTags(event.description);

                  return (
                    <li
                      key={event.id}
                      className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {tags.map((tag) => {
                              const entry = tagIconMap[tag];
                              return (
                                <span
                                  key={tag}
                                  title={entry.label}
                                  className={`inline-flex items-center justify-center text-xl ${entry.colorClassName}`}
                                >
                                  <FontAwesomeIcon
                                    icon={entry.icon}
                                    className="h-5 w-5"
                                  />
                                  <span className="sr-only">{entry.label}</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                        <div>
                          <Link
                            href={`/calendar/${encodeURIComponent(event.id)}`}
                            className="font-medium text-foreground transition hover:text-primary"
                          >
                            {event.summary}
                          </Link>
                          {event.location ? (
                            <p className="text-sm text-muted-foreground">
                              {event.location}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {event.allDay
                          ? "Ganztägig"
                          : getTimeRange(event.start, event.end)}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
