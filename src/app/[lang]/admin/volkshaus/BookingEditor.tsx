"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";
import Textarea from "@/components/knglmrt/Textarea";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import {
  calculateVolkshausPrice,
  formatEuro,
  getEffectiveVolkshausPrice,
  VOLKSHAUS_EQUIPMENT,
  VOLKSHAUS_ROOMS,
  type VolkshausBooking,
  type VolkshausBookingRequestInput,
} from "@/lib/volkshaus-booking";
import {
  BOOKING_FIELD_LABELS,
  bookingEditValues,
  editablePriceLines,
  getVolkshausInvoiceDetails,
  linesForGrossTotal,
  priceFromEditableLines,
  type EditablePriceLine,
} from "@/lib/volkshaus-admin-edit";

type Props = {
  booking: VolkshausBooking;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  save: (payload: Record<string, unknown>) => Promise<boolean>;
  done: () => void;
};
const panel = "knglmrt-border-section bg-card p-5 space-y-4";

export default function BookingEditor({
  booking,
  busy,
  onDirty,
  save,
  done,
}: Props) {
  const initial = useMemo(() => bookingEditValues(booking), [booking]);
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [lines, setLines] = useState<EditablePriceLine[]>(() =>
    editablePriceLines(booking),
  );
  const [invoice, setInvoice] = useState(() =>
    getVolkshausInvoiceDetails(booking),
  );
  const [reason, setReason] = useState("");
  const [gross, setGross] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dirty =
    JSON.stringify(values) !== JSON.stringify(initial) ||
    JSON.stringify(lines) !== JSON.stringify(editablePriceLines(booking)) ||
    JSON.stringify(invoice) !==
      JSON.stringify(getVolkshausInvoiceDetails(booking));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  const price = useMemo(() => {
    try {
      return {
        value: priceFromEditableLines(lines, booking.priceSnapshot),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Ungültiger Preis",
      };
    }
  }, [lines, booking.priceSnapshot]);
  const set = (key: string, value: unknown) => {
    if (key === "bookingDate" && invoice.serviceDate === values.bookingDate)
      setInvoice((current) => ({ ...current, serviceDate: String(value) }));
    if (
      key === "eventTitle" &&
      invoice.title ===
        `Raumnutzung Neues Volkshaus Cotta · ${values.eventTitle}`
    )
      setInvoice((current) => ({
        ...current,
        title: `Raumnutzung Neues Volkshaus Cotta · ${value}`,
      }));
    if (
      (key === "customerName" || key === "organization") &&
      invoice.recipient === (values.organization || values.customerName)
    ) {
      const nextValues = { ...values, [key]: value };
      setInvoice((current) => ({
        ...current,
        recipient: String(nextValues.organization || nextValues.customerName),
      }));
    }
    setValues((current) => ({ ...current, [key]: value }));
    setReview(false);
  };
  const field = (key: keyof typeof BOOKING_FIELD_LABELS, type = "text") => (
    <Field
      key={key}
      label={BOOKING_FIELD_LABELS[key]}
      type={type}
      value={String(values[key] ?? "")}
      onChange={(event) => set(key, event.target.value)}
    />
  );
  const rooms = values.requestedRooms as string[];
  const equipment = values.equipment as Record<string, number>;
  const changeLine = (
    index: number,
    key: keyof EditablePriceLine,
    value: string,
  ) =>
    setLines((current) =>
      current.map((line, i) =>
        i === index ? { ...line, [key]: value } : line,
      ),
    );
  const oldPrice = getEffectiveVolkshausPrice(booking);
  const displayValue = (value: unknown) =>
    typeof value === "object" ? JSON.stringify(value) : String(value || "–");
  const changedFields = Object.keys(BOOKING_FIELD_LABELS).filter(
    (key) => JSON.stringify(values[key]) !== JSON.stringify(initial[key]),
  );
  const needsRevision =
    Boolean(booking.contractSnapshot) &&
    (changedFields.length > 0 ||
      JSON.stringify(lines) !== JSON.stringify(editablePriceLines(booking)));
  const cancel = () => {
    if (!dirty || window.confirm("Ungespeicherte Änderungen verwerfen?")) {
      onDirty(false);
      done();
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        if (!price.value) {
          setError(price.error);
          return;
        }
        if (!reason.trim()) {
          setError("Bitte eine kurze interne Änderungsnotiz ergänzen.");
          return;
        }
        if (!review) {
          setReview(true);
          return;
        }
        if (needsRevision && !confirmed) {
          setError("Bitte die neue Vertragsversion bestätigen.");
          return;
        }
        const ok = await save({
          expectedUpdatedAt: booking.updatedAt,
          booking: values,
          lines,
          invoice,
          reason,
          confirmRevision: confirmed,
        });
        if (ok) {
          onDirty(false);
          done();
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-5">
        <section className={panel}>
          <h3 className="text-xl font-bold">Buchung bearbeiten</h3>
          <p className="text-sm text-muted-foreground">
            Änderungen werden erst beim Speichern übernommen. Es wird dabei
            keine E-Mail versendet.
          </p>
          {field("eventTitle")}
          <div className="grid gap-3 sm:grid-cols-3">
            {field("bookingDate", "date")}
            {field("startTime", "time")}
            {field("endTime", "time")}
          </div>
          <div className="flex flex-wrap gap-4">
            {VOLKSHAUS_ROOMS.map((room) => (
              <label key={room.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rooms.includes(room.id)}
                  onChange={(event) =>
                    set(
                      "requestedRooms",
                      event.target.checked
                        ? [...rooms, room.id]
                        : rooms.filter((id) => id !== room.id),
                    )
                  }
                />
                {room.label}
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("expectedAttendees", "number")}
            {field("setupStartTime", "time")}
            {field("teardownEndTime", "time")}
          </div>
          <Textarea
            label="Nutzung / Beschreibung"
            value={String(values.eventDescription)}
            onChange={(event) => set("eventDescription", event.target.value)}
          />
          <details>
            <summary className="cursor-pointer font-bold">
              Technik, Tarif und Absprachen
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {VOLKSHAUS_EQUIPMENT.map((item) => (
                  <Field
                    key={item.id}
                    label={item.label}
                    type="number"
                    min={0}
                    max={item.maxQuantity}
                    step={1}
                    value={equipment[item.id] ?? 0}
                    onChange={(event) =>
                      set("equipment", {
                        ...equipment,
                        [item.id]: Number(event.target.value),
                      })
                    }
                  />
                ))}
              </div>
              <NativeSelect
                label="Tarifgruppe"
                value={String(values.usageType)}
                onChange={(event) => set("usageType", event.target.value)}
              >
                <option value="commercial">Privat / gewerblich</option>
                <option value="neighborhood">Nachbarschaftlich</option>
              </NativeSelect>
              <NativeSelect
                label="Häufigkeit"
                value={String(values.frequency)}
                onChange={(event) => set("frequency", event.target.value)}
              >
                <option value="one_time">Einmalig</option>
                <option value="recurring">Regelmäßig</option>
              </NativeSelect>
              {values.frequency === "recurring"
                ? field("recurringOccurrences", "number")
                : null}
              <Textarea
                label="Nutzungsabsprachen (auch für Kund:innen sichtbar)"
                value={String(values.specialRequirements)}
                onChange={(event) =>
                  set("specialRequirements", event.target.value)
                }
              />
            </div>
          </details>
        </section>
        <details className={panel}>
          <summary className="cursor-pointer text-lg font-bold">
            Kontakt und Rechnungsanschrift
          </summary>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("customerName")}
            {field("organization")}
            {field("email", "email")}
            {field("phone", "tel")}
          </div>
          {field("billingAddressLine")}
          <div className="grid gap-3 sm:grid-cols-2">
            {field("billingZip")}
            {field("billingCity")}
          </div>
        </details>
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold">Preis und Rechnung</h3>
            <strong>
              {price.value ? formatEuro(price.value.grossCents) : "–"} brutto
            </strong>
          </div>
          <p className="text-sm text-muted-foreground">
            Der vereinbarte Preis bleibt bei Änderungen erhalten. Negative
            Positionen sind Nachlässe. Alle Einzelpreise sind netto, zuzüglich
            19 % USt.
          </p>
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid items-end gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_auto]"
            >
              <Field
                label={`Position ${index + 1}`}
                value={line.description}
                maxLength={500}
                onChange={(event) =>
                  changeLine(index, "description", event.target.value)
                }
              />
              <Field
                label="Menge"
                type="number"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(event) =>
                  changeLine(index, "quantity", event.target.value)
                }
              />
              <Field
                label="Einzelpreis €"
                inputMode="decimal"
                value={line.unitEuro}
                onChange={(event) =>
                  changeLine(index, "unitEuro", event.target.value)
                }
              />
              <Button
                type="button"
                kind="tertiary"
                aria-label={`Position ${index + 1} entfernen`}
                onClick={() =>
                  setLines((current) => current.filter((_, i) => i !== index))
                }
              >
                Entfernen
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              kind="secondary"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  { description: "", quantity: "1", unitEuro: "0.00" },
                ])
              }
            >
              Position hinzufügen
            </Button>
            <Button
              type="button"
              kind="tertiary"
              onClick={() => {
                if (
                  !window.confirm(
                    "Den vereinbarten Preis durch eine neue Tarifberechnung ersetzen?",
                  )
                )
                  return;
                try {
                  const calculated = calculateVolkshausPrice({
                    ...values,
                    expectedAttendees: Number(values.expectedAttendees),
                    recurringOccurrences: Number(values.recurringOccurrences),
                  } as unknown as VolkshausBookingRequestInput);
                  setLines(
                    calculated.lines.map((line) => ({
                      description: line.description,
                      quantity: String(line.quantity),
                      unitEuro: (line.unitNetCents / 100).toFixed(2),
                    })),
                  );
                  setError(null);
                } catch {
                  setError("Bitte zuerst Datum, Zeiten und Räume prüfen.");
                }
              }}
            >
              Nach Tarif neu berechnen
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label="Gewünschter Endpreis brutto €"
              inputMode="decimal"
              value={gross}
              onChange={(event) => setGross(event.target.value)}
            />
            <Button
              type="button"
              kind="secondary"
              onClick={() => {
                try {
                  setLines(linesForGrossTotal(gross, lines));
                  setError(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Ungültiger Betrag",
                  );
                }
              }}
            >
              Endpreis übernehmen
            </Button>
          </div>
          {price.error ? (
            <p role="alert" className="text-destructive">
              {price.error}
            </p>
          ) : (
            <p className="text-sm">
              {formatEuro(price.value!.netCents)} netto +{" "}
              {formatEuro(price.value!.taxCents)} USt. ={" "}
              <strong>{formatEuro(price.value!.grossCents)} brutto</strong>
            </p>
          )}
          {booking.priceSnapshot.admin?.originalPrice ? (
            <p className="text-sm text-muted-foreground">
              Ursprünglich:{" "}
              {formatEuro(booking.priceSnapshot.admin.originalPrice.grossCents)}{" "}
              brutto
            </p>
          ) : null}
          <details>
            <summary className="cursor-pointer font-bold">
              Rechnungstext und Empfänger anpassen
            </summary>
            <div className="mt-4 space-y-3">
              <Field
                label="Rechnungsempfänger (unabhängig von der Kontaktperson)"
                value={invoice.recipient}
                onChange={(event) =>
                  setInvoice({ ...invoice, recipient: event.target.value })
                }
              />
              <Field
                label="Leistungsdatum"
                type="date"
                value={invoice.serviceDate}
                onChange={(event) =>
                  setInvoice({ ...invoice, serviceDate: event.target.value })
                }
              />
              <Field
                label="Leistungstext auf der Rechnung"
                value={invoice.title}
                onChange={(event) =>
                  setInvoice({ ...invoice, title: event.target.value })
                }
              />
              <Textarea
                label="Einleitung der Rechnung"
                value={invoice.intro}
                onChange={(event) =>
                  setInvoice({ ...invoice, intro: event.target.value })
                }
              />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-bold">
              Rechnungsinhalt in der Vorschau
            </summary>
            <div className="mt-4 space-y-2 border border-border bg-background p-4 text-sm">
              <p className="font-bold">{invoice.recipient}</p>
              <p>
                {String(values.billingAddressLine)}
                <br />
                {String(values.billingZip)} {String(values.billingCity)}
              </p>
              <p>Leistungsdatum: {invoice.serviceDate}</p>
              <p>{invoice.intro}</p>
              <p className="font-bold">{invoice.title}</p>
              {price.value?.lines.map((line) => (
                <p key={line.code}>
                  {line.quantity} × {line.description} —{" "}
                  {formatEuro(line.totalNetCents)} netto
                </p>
              ))}
              <p className="font-bold">
                Gesamt: {price.value ? formatEuro(price.value.grossCents) : "–"}{" "}
                brutto
              </p>
              <p className="text-muted-foreground">
                Inhaltsvorschau. Die endgültige Rechnung wird in Campai
                erstellt.
              </p>
            </div>
          </details>
        </section>
        <section className={panel}>
          <Textarea
            label="Interne Änderungsnotiz"
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder="z. B. Endpreis telefonisch vereinbart"
          />
          <p className="text-sm text-muted-foreground">
            Diese Notiz erscheint weder auf der Rechnung noch im Vertrag.
          </p>
          {needsRevision ? (
            <label className="flex items-start gap-3 rounded border border-warning-border bg-warning-soft p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Eine neue Vertragsversion vorbereiten. Die bisherige Version
                samt Unterschriften bleibt erhalten. Der neue Entwurf muss
                anschließend erneut freigegeben und unterschrieben werden.
              </span>
            </label>
          ) : null}
          {booking.campaiInvoiceId ? (
            <p className="rounded border border-warning-border bg-warning-soft p-3 text-sm">
              Es gibt bereits eine Campai-Rechnung. Speichern ändert diesen
              Beleg nicht automatisch. Die Rechnungsprüfung bleibt als Aufgabe
              offen.
            </p>
          ) : null}
          {review ? (
            <div role="status" className="space-y-2 border border-border p-4">
              <h4 className="font-bold">Änderungen prüfen</h4>
              {changedFields.map((key) => (
                <p key={key} className="break-words text-sm">
                  <strong>
                    {
                      BOOKING_FIELD_LABELS[
                        key as keyof typeof BOOKING_FIELD_LABELS
                      ]
                    }
                    :
                  </strong>{" "}
                  {displayValue(initial[key])} → {displayValue(values[key])}
                </p>
              ))}
              {JSON.stringify(lines) !==
              JSON.stringify(editablePriceLines(booking)) ? (
                <div className="text-sm">
                  <strong>
                    Preis: {formatEuro(oldPrice.grossCents)} →{" "}
                    {price.value ? formatEuro(price.value.grossCents) : "–"}{" "}
                    brutto
                  </strong>
                  {lines.map((line, index) => (
                    <p key={index}>
                      {line.quantity} × {line.description}: {line.unitEuro} €
                      netto je Einheit
                    </p>
                  ))}
                </div>
              ) : null}
              {JSON.stringify(invoice) !==
              JSON.stringify(getVolkshausInvoiceDetails(booking)) ? (
                <div className="text-sm">
                  <strong>Neue Rechnungsangaben:</strong>
                  <p>
                    {invoice.recipient} · {invoice.serviceDate}
                  </p>
                  <p>{invoice.title}</p>
                  <p>{invoice.intro}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={!dirty || busy} kind="primary">
              {busy
                ? "Wird gespeichert …"
                : review
                  ? "Änderungen speichern"
                  : "Änderungen prüfen"}
            </Button>
            <Button type="button" kind="secondary" onClick={cancel}>
              Abbrechen
            </Button>
          </div>
        </section>
      </fieldset>
    </form>
  );
}
