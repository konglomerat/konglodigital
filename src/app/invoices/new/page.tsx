"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faEuroSign,
  faFileInvoice,
  faList,
  faRotate,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import {
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "../../components/ui/form";

type InvoicePosition = {
  id: string;
  description: string;
  quantity: string;
  unitAmountEuro: string;
  details: string;
  taxCode: "" | "0" | "7" | "19";
  costCenter1: string;
  discountPercent: string;
};

type CostCenterOption = {
  value: string;
  label: string;
};

type PaymentMethod =
  | ""
  | "bank-transfer"
  | "cash"
  | "card"
  | "direct-debit"
  | "other";

const euroPattern = /^\d+(?:,\d{1,2})?$/;

const fetchJson = async <T,>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

const createPosition = (): InvoicePosition => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  description: "",
  quantity: "",
  unitAmountEuro: "",
  details: "",
  taxCode: "",
  costCenter1: "",
  discountPercent: "",
});

const parseQuantity = (value: string) => {
  const normalized = value.trim().replace(".", ",");
  if (!/^\d+(?:,\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const parsed = Number.parseFloat(normalized.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const parseEuroToCents = (value: string) => {
  const normalized = value.trim();
  if (!euroPattern.test(normalized)) {
    return null;
  }
  const parsed = Number.parseFloat(normalized.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100);
};

const parsePercent = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }
  if (!euroPattern.test(normalized)) {
    return 0;
  }
  const parsed = Number.parseFloat(normalized.replace(",", "."));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
};

export default function NewSimpleInvoicePage() {
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [note, setNote] = useState("");
  const [sendByMail, setSendByMail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [details1, setDetails1] = useState("");
  const [details2, setDetails2] = useState("");
  const [paid, setPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [positions, setPositions] = useState<InvoicePosition[]>([
    createPosition(),
  ]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [costCentersLoading, setCostCentersLoading] = useState(true);
  const [costCentersError, setCostCentersError] = useState<string | null>(null);
  const [isNet, setIsNet] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadCostCenters = async () => {
      try {
        setCostCentersLoading(true);
        const response = await fetchJson<{ costCenters: CostCenterOption[] }>(
          "/api/campai/cost-centers",
        );

        if (!active) {
          return;
        }

        const items = response.costCenters ?? [];
        setCostCenters(items);
        setCostCentersError(null);

        if (items.length > 0) {
          const firstValue = items[0].value;
          setPositions((prev) =>
            prev.map((position) =>
              position.costCenter1
                ? position
                : { ...position, costCenter1: firstValue },
            ),
          );
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setCostCentersError(
          error instanceof Error
            ? error.message
            : "Kostenstellen konnten nicht geladen werden.",
        );
      } finally {
        if (active) {
          setCostCentersLoading(false);
        }
      }
    };

    loadCostCenters();

    return () => {
      active = false;
    };
  }, []);

  const validPositions = useMemo(() => {
    return positions
      .map((position) => {
        const quantity = parseQuantity(position.quantity);
        const unitAmount = parseEuroToCents(position.unitAmountEuro);
        const description = position.description.trim();
        if (
          !description ||
          quantity === null ||
          unitAmount === null ||
          !position.taxCode
        ) {
          return null;
        }
        return {
          description,
          quantity,
          unitAmount,
          details: position.details.trim(),
          taxCode: position.taxCode,
          costCenter1: position.costCenter1 || undefined,
          discount: parsePercent(position.discountPercent),
        };
      })
      .filter((position): position is NonNullable<typeof position> =>
        Boolean(position),
      );
  }, [positions]);

  const totalCents = useMemo(
    () =>
      validPositions.reduce(
        (sum, position) =>
          sum + Math.round(position.quantity * position.unitAmount),
        0,
      ),
    [validPositions],
  );

  const updatePosition = (
    id: string,
    field: keyof Omit<InvoicePosition, "id">,
    value: string,
  ) => {
    setPositions((prev) =>
      prev.map((position) =>
        position.id === id ? { ...position, [field]: value } : position,
      ),
    );
  };

  const addPosition = () => {
    setPositions((prev) => [
      ...prev,
      {
        ...createPosition(),
        costCenter1: costCenters[0]?.value ?? "",
      },
    ]);
  };

  const removePosition = (id: string) => {
    setPositions((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.filter((position) => position.id !== id);
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!addressLine.trim() || !zip.trim() || !city.trim()) {
      setErrorMessage("Bitte Straße/Adresse, PLZ und Stadt ausfüllen.");
      return;
    }

    if (sendByMail && !recipientEmail.trim()) {
      setErrorMessage("Bitte E-Mail-Empfänger eintragen, wenn Versand aktiv ist.");
      return;
    }

    if (validPositions.length === 0) {
      setErrorMessage(
        "Bitte mindestens eine gültige Position mit Beschreibung, Menge und Einzelpreis anlegen.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetchJson<{ id: string | null }>(
        "/api/campai/offer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            intro: intro.trim(),
            note,
            sendByMail,
            recipientEmail: recipientEmail.trim() || undefined,
            paid,
            paymentMethod: paymentMethod || undefined,
            invoiceDate: invoiceDate || undefined,
            dueDate: dueDate || undefined,
            deliveryDate: deliveryDate || undefined,
            isNet,
            address: {
              country: "DE",
              zip: zip.trim(),
              city: city.trim(),
              addressLine: addressLine.trim(),
              details1: details1.trim() || undefined,
              details2: details2.trim() || undefined,
            },
            positions: validPositions,
          }),
        },
      );

      setSuccessMessage(
        response.id
          ? `Entwurf erstellt (ID: ${response.id}).`
          : "Entwurf erfolgreich erstellt.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Rechnungsentwurf konnte nicht erstellt werden.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showCostCenterWarning =
    !costCentersLoading && (costCenters.length === 0 || Boolean(costCentersError));

  const fillWithTestData = () => {
    const defaultCostCenter = costCenters[0]?.value ?? "";
    setTitle("Testrechnung Makerspace");
    setIntro("Vielen Dank für Ihren Auftrag. Wir berechnen folgende Leistungen:");
    setNote("Bitte überweisen Sie den Betrag innerhalb von 14 Tagen.");
    setAddressLine("Musterstraße 1");
    setZip("12345");
    setCity("Musterstadt");
    setDetails1("");
    setDetails2("");
    setPaid(false);
    setPaymentMethod("bank-transfer");
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setInvoiceDate(today);
    setDueDate(due);
    setDeliveryDate(today);
    setIsNet(true);
    setSendByMail(false);
    setRecipientEmail("");
    setPositions([
      {
        id: `test-1`,
        description: "Maschinenstunde Lasercutter",
        quantity: "2",
        unitAmountEuro: "15,00",
        details: "60 min à 15 €",
        taxCode: "19",
        costCenter1: defaultCostCenter,
        discountPercent: "",
      },
      {
        id: `test-2`,
        description: "Material (Sperrholz 3mm)",
        quantity: "1",
        unitAmountEuro: "8,50",
        details: "",
        taxCode: "19",
        costCenter1: defaultCostCenter,
        discountPercent: "",
      },
    ]);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Einfache Rechnung
        </h1>
        <p className="text-sm text-zinc-600">
          Erstelle einen Campai-Rechnungsentwurf von Grund auf für
          Makerspace-Leistungen.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Rechnungsdaten"
          icon={faFileInvoice}
          description="Grunddaten, Datumsfelder und Zahlungsinformationen."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Titel" required>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </FormField>
            <FormField label="Zahlungsart">
              <Select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
              >
                <option value="">Bitte wählen</option>
                <option value="bank-transfer">Überweisung</option>
                <option value="cash">Bar</option>
                <option value="card">Karte</option>
                <option value="direct-debit">Lastschrift</option>
                <option value="other">Sonstiges</option>
              </Select>
            </FormField>

            <FormField label="Rechnungsdatum">
              <Input
                type="date"
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
              />
            </FormField>
            <FormField label="Fälligkeitsdatum">
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </FormField>

            <FormField label="Lieferdatum">
              <Input
                type="date"
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
              />
            </FormField>
            <FormField label="Status">
              <label className="inline-flex h-10 items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={paid}
                  onChange={(event) => setPaid(event.target.checked)}
                />
                Bezahlt
              </label>
            </FormField>

            <FormField label="Einleitung" required>
              <Input value={intro} onChange={(event) => setIntro(event.target.value)} />
            </FormField>
            <FormField label="Rechnungsart">
              <label className="inline-flex h-10 items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={isNet}
                  onChange={(event) => setIsNet(event.target.checked)}
                />
                Netto-Rechnung
              </label>
            </FormField>

            <div className="md:col-span-2">
              <FormField label="Interne Notiz">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </FormField>
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Versand & Kunde"
          icon={faEnvelope}
          description="Versandoptionen und Kundendaten für die Rechnung."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 rounded-2xl border border-zinc-200 p-3">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={sendByMail}
                  onChange={(event) => setSendByMail(event.target.checked)}
                />
                Automatisch per E-Mail versenden
              </label>
            </div>

            {sendByMail ? (
              <div className="md:col-span-2">
                <FormField label="E-Mail-Empfänger" required>
                  <Input
                    type="email"
                    value={recipientEmail}
                    onChange={(event) => setRecipientEmail(event.target.value)}
                    placeholder="kunde@beispiel.de"
                  />
                </FormField>
              </div>
            ) : null}

            <div className="md:col-span-2">
              <FormField label="Straße / Adresse" required>
                <Input
                  value={addressLine}
                  onChange={(event) => setAddressLine(event.target.value)}
                  required
                />
              </FormField>
            </div>
            <FormField label="PLZ" required>
              <Input
                value={zip}
                onChange={(event) => setZip(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Stadt" required>
              <Input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                required
              />
            </FormField>
            <FormField label="Adresszusatz 1">
              <Input
                value={details1}
                onChange={(event) => setDetails1(event.target.value)}
              />
            </FormField>
            <FormField label="Adresszusatz 2">
              <Input
                value={details2}
                onChange={(event) => setDetails2(event.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection
          title="Positionen"
          icon={faList}
          description="Leistungspositionen inkl. Steuern, Rabatt und Kostenstelle."
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Steuercode-Hinweis: 19% für reguläre Dienstleistungen/Verkäufe,
              7% nur für begünstigte Leistungen, 0% für steuerfreie Positionen.
            </p>
            <Button type="button" kind="secondary" onClick={addPosition}>
              Position hinzufügen
            </Button>
          </div>

          {showCostCenterWarning ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4" />
                <span>
                  Kostenstellen konnten nicht aus Campai geladen werden.
                  {costCentersError ? ` ${costCentersError}` : ""}
                </span>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            {positions.map((position, index) => (
              <div
                key={position.id}
                className="rounded-2xl border border-zinc-200 p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold text-zinc-800">
                    Position {index + 1}
                  </h3>
                  <Button
                    type="button"
                    kind="danger-secondary"
                    onClick={() => removePosition(position.id)}
                    disabled={positions.length === 1}
                  >
                    Entfernen
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <FormField label="Beschreibung" required>
                      <Input
                        value={position.description}
                        onChange={(event) =>
                          updatePosition(
                            position.id,
                            "description",
                            event.target.value,
                          )
                        }
                      />
                    </FormField>
                  </div>

                  <div className="md:col-span-2">
                    <FormField label="Menge" required>
                      <Input
                        value={position.quantity}
                        inputMode="decimal"
                        onChange={(event) =>
                          updatePosition(position.id, "quantity", event.target.value)
                        }
                        placeholder="1"
                      />
                    </FormField>
                  </div>

                  <div className="md:col-span-2">
                    <FormField label="Einzelpreis €" required>
                      <Input
                        value={position.unitAmountEuro}
                        inputMode="decimal"
                        onChange={(event) =>
                          updatePosition(
                            position.id,
                            "unitAmountEuro",
                            event.target.value,
                          )
                        }
                        placeholder="12,50"
                      />
                    </FormField>
                  </div>

                  <div className="md:col-span-1">
                    <FormField label="Rabatt %">
                      <Input
                        value={position.discountPercent}
                        inputMode="decimal"
                        pattern="^\\d+(,\\d{1,2})?$"
                        title="Bitte Komma als Dezimaltrennzeichen verwenden (z. B. 2,5)."
                        onChange={(event) =>
                          updatePosition(
                            position.id,
                            "discountPercent",
                            event.target.value,
                          )
                        }
                        placeholder="0"
                      />
                    </FormField>
                  </div>

                  <div className="md:col-span-2">
                    <FormField label="Steuercode">
                      <Select
                        value={position.taxCode}
                        onChange={(event) =>
                          updatePosition(position.id, "taxCode", event.target.value)
                        }
                      >
                        <option value="">Bitte wählen</option>
                        <option value="0">0%</option>
                        <option value="7">7%</option>
                        <option value="19">19%</option>
                      </Select>
                    </FormField>
                  </div>

                  <div className="md:col-span-5">
                    <FormField
                      label="Kostenstelle"
                      hint={
                        costCentersLoading
                          ? "Kostenstellen werden geladen ..."
                          : undefined
                      }
                    >
                      <Select
                        value={position.costCenter1}
                        onChange={(event) =>
                          updatePosition(
                            position.id,
                            "costCenter1",
                            event.target.value,
                          )
                        }
                        disabled={costCentersLoading || costCenters.length === 0}
                      >
                        {costCenters.length === 0 ? (
                          <option value="">Keine Kostenstellen verfügbar</option>
                        ) : null}
                        {costCenters.map((center) => (
                          <option key={center.value} value={center.value}>
                            {center.label}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  </div>

                  <div className="md:col-span-7">
                    <FormField label="Details">
                      <Input
                        value={position.details}
                        onChange={(event) =>
                          updatePosition(position.id, "details", event.target.value)
                        }
                      />
                    </FormField>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </FormSection>

        <FormSection
          title="Zusammenfassung"
          icon={faEuroSign}
          description="Prüfe die Gesamtsumme und erstelle anschließend den Entwurf."
        >
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm text-zinc-700">
              Gültige Positionen: {validPositions.length}
            </p>
            <p className="text-sm font-semibold text-zinc-900">
              Summe: €{(totalCents / 100).toFixed(2)}
            </p>
          </div>
        </FormSection>

        {errorMessage ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            kind="secondary"
            icon={faRotate}
            onClick={fillWithTestData}
            disabled={submitting}
          >
            Mit Testdaten füllen
          </Button>
          <Button type="submit" kind="primary" disabled={submitting}>
            {submitting
              ? "Entwurf wird erstellt..."
              : "Rechnungsentwurf erstellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
