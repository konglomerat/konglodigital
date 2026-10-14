export default function GenerateNewsletterLoading() {
  return (
    <div
      className="w-full space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Newsletter wird geladen"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Öffentlichkeitsarbeit
        </p>
        <h1 className="text-3xl font-bold text-foreground">
          Newsletter wird vorbereitet …
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Beiträge und Rapidmail-Daten werden geladen. Deine im Browser
          gespeicherte Auswahl bleibt erhalten.
        </p>
      </div>

      <section className="grid animate-pulse gap-3 sm:grid-cols-3">
        {["Verfügbare Beiträge", "Im Newsletter", "Inhaltsblöcke"].map(
          (label) => (
            <div key={label} className="knglmrt-border-section bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <div className="mt-3 h-7 w-16 rounded bg-muted" />
            </div>
          ),
        )}
      </section>

      <div className="grid animate-pulse gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <div className="knglmrt-border-section h-48 bg-card" />
          <div className="knglmrt-border-section h-80 bg-card" />
        </div>
        <div className="knglmrt-border-section h-[36rem] bg-card" />
      </div>
    </div>
  );
}
