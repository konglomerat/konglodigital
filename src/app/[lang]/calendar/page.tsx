import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Kalender
          </p>
          <h1 className="text-2xl font-bold text-zinc-900">Nächste 7 Tage</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Übersicht aller Termine im Google Kalender.
          </p>
        </div>
        <a
          href={CALENDAR_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-full border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
        >
          Google Kalender öffnen
        </a>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4">
        {days.map((day) => (
          <section
            key={day.key}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-zinc-900">
                {day.label}
              </h2>
            </div>
            <ul className="mt-3 divide-y divide-zinc-200/20">
              {day.events.length === 0 ? (
                <li className="py-3 text-sm text-zinc-500">
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
                            className="font-medium text-zinc-900 transition hover:text-blue-600"
                          >
                            {event.summary}
                          </Link>
                          {event.location ? (
                            <p className="text-sm text-zinc-500">
                              {event.location}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-sm text-zinc-600">
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
