"use client";
import { useState } from "react";
import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";
import { type VolkshausBooking } from "@/lib/volkshaus-booking";

export default function BookingHistory({
  booking,
  busy,
  resolveCorrection,
}: {
  booking: VolkshausBooking;
  busy: boolean;
  resolveCorrection: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const admin = booking.priceSnapshot.admin;
  const correction = admin?.invoiceCorrection;
  return (
    <div className="space-y-5">
      {correction?.required ? (
        <section className="knglmrt-border bg-warning-soft p-5 space-y-3">
          <h3 className="text-lg font-bold">Rechnung in Campai prüfen</h3>
          <p>
            Die Buchung wurde nach der Rechnungsanlage geändert. Korrigiere den
            Beleg in Campai und dokumentiere hier die Belegreferenz und das
            Ergebnis.
          </p>
          <a
            className="inline-block font-bold underline"
            href="https://app.campai.com"
            target="_blank"
            rel="noreferrer"
          >
            Campai öffnen
          </a>
          <p className="break-all text-sm">
            Bisherige Rechnungs-ID: {correction.invoiceId}
          </p>
          <Field
            label="Ausgeführte Korrektur / Belegreferenz"
            value={note}
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button
            kind="secondary"
            disabled={busy || !note.trim()}
            onClick={async () => {
              if (await resolveCorrection(note)) setNote("");
            }}
          >
            Als in Campai erledigt dokumentieren
          </Button>
          <p className="text-sm">
            Diese Bestätigung ändert oder versendet selbst keinen Beleg.
          </p>
        </section>
      ) : null}
      <section className="knglmrt-border-section bg-card p-5 space-y-3">
        <h3 className="text-lg font-bold">Vertragsversionen</h3>
        {booking.contractSnapshot ? (
          <a
            className="block underline"
            href={`/api/volkshaus/requests/access/${encodeURIComponent(booking.accessToken)}/contract`}
            target="_blank"
            rel="noreferrer"
          >
            Aktuelle Version {booking.contractVersion} (PDF)
          </a>
        ) : (
          <p>Die aktuelle Bearbeitung ist ein Vertragsentwurf.</p>
        )}
        {[...(admin?.archivedContracts ?? [])].reverse().map((contract) => (
          <a
            key={contract.version}
            className="block underline"
            href={`/api/volkshaus/requests/access/${encodeURIComponent(booking.accessToken)}/contract?version=${contract.version}`}
            target="_blank"
            rel="noreferrer"
          >
            Version {contract.version} ·{" "}
            {contract.customerSignature
              ? "unterschrieben"
              : "ohne Kundenunterschrift"}{" "}
            (PDF)
          </a>
        ))}
      </section>
      <section className="knglmrt-border-section bg-card p-5">
        <h3 className="mb-4 text-lg font-bold">Änderungsverlauf</h3>
        {admin?.changes?.length ? (
          <ol className="space-y-4">
            {[...admin.changes].reverse().map((entry, index) => (
              <li
                key={`${entry.at}-${index}`}
                className="border-b border-border pb-4"
              >
                <p className="font-bold">{entry.reason}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(entry.at).toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                  })}{" "}
                  · {entry.by}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm">
                    {entry.changes.length} Änderung
                    {entry.changes.length === 1 ? "" : "en"} ansehen
                  </summary>
                  <dl className="mt-3 space-y-3">
                    {entry.changes.map((change, i) => (
                      <div key={i} className="break-words text-sm">
                        <dt className="font-bold">{change.label}</dt>
                        <dd>Vorher: {change.before}</dd>
                        <dd>Danach: {change.after}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Noch keine Änderungen mit dem neuen Editor gespeichert.
          </p>
        )}
      </section>
    </div>
  );
}
