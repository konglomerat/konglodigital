// Platzhalter für die Tagesliste des Kalenders — von der Seite (Suspense)
// und von loading.tsx geteilt.
export default function CalendarDaysSkeleton() {
  return (
    <div role="status">
      <div aria-hidden="true" className="grid animate-pulse gap-4">
        {[0, 1, 2].map((day) => (
          <section key={day} className="knglmrt-border-section bg-card p-4">
            <span className="block h-6 w-48 bg-muted" />
            <span className="mt-4 block h-4 w-2/3 bg-muted" />
            <span className="mt-2 block h-4 w-1/3 bg-muted" />
          </section>
        ))}
      </div>
      <span className="sr-only">Termine werden geladen.</span>
    </div>
  );
}
