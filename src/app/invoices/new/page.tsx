"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faCheck,
  faFileInvoice,
  faList,
  faPlus,
  faRotate,
  faTrash,
  faTriangleExclamation,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import {
  AutocompleteInput,
  type Suggestion as DebtorSuggestion,
} from "../../components/ui/autocomplete-input";
import {
  ProductAutocompleteInput,
  type ProductSuggestion,
} from "../../components/ui/product-autocomplete-input";
import {
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "../../components/ui/form";
import {
  CAMPAI_PAYMENT_METHOD_TYPES,
  type CampaiPaymentMethodType,
} from "@/lib/campai-payment-methods";

type InvoicePosition = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  unitAmountEuro: string;
  taxCode: "" | "0" | "7" | "19";
  costCenter1: string;
  discountPercent: string;
};

type CostCenterOption = {
  value: string;
  label: string;
};

type PaymentMethod = "" | CampaiPaymentMethodType;

type PaymentMethodOption = {
  value: CampaiPaymentMethodType;
  label: string;
};

type InvoiceTaxCode = "" | "0" | "7" | "19";

type DebtorDetails = {
  account?: number | null;
  name?: string;
  email?: string;
  paymentMethodType?: CampaiPaymentMethodType | null;
  address?: {
    country?: string;
    state?: string;
    zip?: string;
    city?: string;
    addressLine?: string;
    details1?: string;
    details2?: string;
  } | null;
};

const euroPattern = /^\d+(?:,\d{1,2})?$/;
const invoiceSubjectPrefill =
  "Für [text] erlauben wir Ihnen folgenden Betrag in Rechnung zu stellen";

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
  unit: "",
  quantity: "",
  unitAmountEuro: "",
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

const formatCentsForInput = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return (value / 100).toFixed(2).replace(".", ",");
};

const normalizeInvoiceTaxCode = (value: unknown): InvoiceTaxCode => {
  if (value === "0" || value === "7" || value === "19") {
    return value;
  }

  return "";
};

const getDefaultPaymentMethod = (items: PaymentMethodOption[]): PaymentMethod => {
  const preferred = CAMPAI_PAYMENT_METHOD_TYPES.find((value) =>
    items.some((item) => item.value === value),
  );
  return preferred ?? items[0]?.value ?? "";
};

export default function NewSimpleInvoicePage() {
  const [intro, setIntro] = useState(invoiceSubjectPrefill);
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
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [debtorAccount, setDebtorAccount] = useState<number | null>(null);
  const [debtorName, setDebtorName] = useState("");
  const [showCreateDebtorPanel, setShowCreateDebtorPanel] = useState(false);
  const [isCreatingDebtor, setIsCreatingDebtor] = useState(false);
  const [debtorError, setDebtorError] = useState<string | null>(null);
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
  const [showTaxHint, setShowTaxHint] = useState(false);
  const taxHintContainerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    let active = true;

    const loadPaymentMethods = async () => {
      try {
        setPaymentMethodsLoading(true);
        const response = await fetchJson<{ paymentMethods: PaymentMethodOption[] }>(
          "/api/campai/payment-methods",
        );

        if (!active) {
          return;
        }

        const items = response.paymentMethods ?? [];
        setPaymentMethods(items);
        setPaymentMethodsError(
          items.length === 0
            ? "Es wurden keine vorhandenen Zahlungsarten in Campai gefunden."
            : null,
        );
        setPaymentMethod((current) =>
          current && items.some((item) => item.value === current)
            ? current
            : "",
        );
      } catch (error) {
        if (!active) {
          return;
        }
        setPaymentMethods([]);
        setPaymentMethodsError(
          error instanceof Error
            ? error.message
            : "Zahlungsarten konnten nicht geladen werden.",
        );
      } finally {
        if (active) {
          setPaymentMethodsLoading(false);
        }
      }
    };

    loadPaymentMethods();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showTaxHint) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!taxHintContainerRef.current?.contains(target)) {
        setShowTaxHint(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [showTaxHint]);

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
          unit: position.unit.trim(),
          quantity,
          unitAmount,
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

  const handleDebtorSelect = async (suggestion: DebtorSuggestion) => {
    setDebtorAccount(suggestion.account);
    setDebtorName(suggestion.name);
    setShowCreateDebtorPanel(false);
    setDebtorError(null);

    if (
      suggestion.paymentMethodType &&
      paymentMethods.some((item) => item.value === suggestion.paymentMethodType)
    ) {
      setPaymentMethod(suggestion.paymentMethodType as PaymentMethod);
    }

    try {
      const params = new URLSearchParams({ account: String(suggestion.account) });
      const response = await fetchJson<{ debtor?: DebtorDetails | null }>(
        `/api/campai/debtors?${params.toString()}`,
      );
      const debtor = response.debtor;

      if (!debtor) {
        return;
      }

      setRecipientEmail(debtor.email ?? "");
      setAddressLine(debtor.address?.addressLine ?? "");
      setZip(debtor.address?.zip ?? "");
      setCity(debtor.address?.city ?? "");
      setDetails1(debtor.address?.details1 ?? "");
      setDetails2(debtor.address?.details2 ?? "");

      if (
        debtor.paymentMethodType &&
        paymentMethods.some((item) => item.value === debtor.paymentMethodType)
      ) {
        setPaymentMethod(debtor.paymentMethodType);
      }
    } catch (error) {
      setDebtorError(
        error instanceof Error
          ? error.message
          : "Debitorendaten konnten nicht übernommen werden.",
      );
    }
  };

  const handleCreateDebtor = (name: string) => {
    setDebtorAccount(null);
    setDebtorName(name);
    setShowCreateDebtorPanel(true);
    setDebtorError(null);
  };

  const resetDebtor = () => {
    setDebtorAccount(null);
    setDebtorName("");
    setShowCreateDebtorPanel(false);
    setDebtorError(null);
  };

  const createDebtor = async () => {
    setDebtorError(null);

    if (!debtorName.trim()) {
      setDebtorError("Bitte zuerst einen Debitorennamen eingeben.");
      return;
    }

    if (!addressLine.trim() || !zip.trim() || !city.trim()) {
      setDebtorError(
        "Für neue Debitoren werden Straße/Adresse, PLZ und Stadt benötigt.",
      );
      return;
    }

    setIsCreatingDebtor(true);
    try {
      const response = await fetchJson<{
        account?: number | null;
        name?: string;
        paymentMethodType?: CampaiPaymentMethodType | null;
      }>("/api/campai/debtors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: debtorName,
          type: "business",
          paymentMethodType: paymentMethod || undefined,
          email: recipientEmail.trim() || undefined,
          receiptSendMethod: recipientEmail.trim()
            ? sendByMail
              ? "email"
              : "postal"
            : "postal",
          address: {
            country: "DE",
            zip: zip.trim(),
            city: city.trim(),
            addressLine: addressLine.trim(),
            details1: details1.trim() || undefined,
            details2: details2.trim() || undefined,
          },
        }),
      });

      if (typeof response.account !== "number" || response.account <= 0) {
        setDebtorError(
          "Debitor wurde erstellt, aber die Debitorennummer konnte nicht ermittelt werden.",
        );
        return;
      }

      setDebtorAccount(response.account);
      setDebtorName(response.name ?? debtorName);
      setShowCreateDebtorPanel(false);
      setDebtorError(null);

      if (
        response.paymentMethodType &&
        paymentMethods.some((item) => item.value === response.paymentMethodType)
      ) {
        setPaymentMethod(response.paymentMethodType);
      }
    } catch (error) {
      setDebtorError(
        error instanceof Error
          ? error.message
          : "Debitor konnte nicht erstellt werden.",
      );
    } finally {
      setIsCreatingDebtor(false);
    }
  };

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

  const handleProductSelect = (
    positionId: string,
    suggestion: ProductSuggestion,
  ) => {
    setPositions((prev) =>
      prev.map((position) => {
        if (position.id !== positionId) {
          return position;
        }

        return {
          ...position,
          description: suggestion.name,
          unit: suggestion.unit ?? position.unit,
          quantity: position.quantity || "1",
          unitAmountEuro:
            typeof suggestion.unitAmount === "number"
              ? formatCentsForInput(suggestion.unitAmount)
              : position.unitAmountEuro,
          taxCode:
            normalizeInvoiceTaxCode(suggestion.taxCode) || position.taxCode,
          costCenter1: suggestion.costCenter1 || position.costCenter1,
        };
      }),
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

    if (!debtorAccount) {
      setErrorMessage("Bitte einen Debitor auswählen oder inline anlegen.");
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
        "/api/campai/invoices/create",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intro: intro.trim(),
            note,
            sendByMail,
            recipientEmail: recipientEmail.trim() || undefined,
            customerNumber: debtorAccount,
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
          ? `Rechnung erstellt (ID: ${response.id}).`
          : "Rechnung erfolgreich erstellt.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Rechnung konnte nicht erstellt werden.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showCostCenterWarning =
    !costCentersLoading && (costCenters.length === 0 || Boolean(costCentersError));

  const fillWithTestData = () => {
    const defaultCostCenter = costCenters[0]?.value ?? "";
    const defaultPaymentMethod = getDefaultPaymentMethod(paymentMethods);
    setIntro(invoiceSubjectPrefill);
    setNote("Bitte überweisen Sie den Betrag innerhalb von 14 Tagen.");
    setDebtorAccount(null);
    setDebtorName("Musterkunde GmbH");
    setShowCreateDebtorPanel(true);
    setDebtorError(null);
    setAddressLine("Musterstraße 1");
    setZip("12345");
    setCity("Musterstadt");
    setDetails1("");
    setDetails2("");
    setPaid(false);
    setPaymentMethod(defaultPaymentMethod);
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
        unit: "Std",
        quantity: "2",
        unitAmountEuro: "15,00",
        taxCode: "19",
        costCenter1: defaultCostCenter,
        discountPercent: "",
      },
      {
        id: `test-2`,
        description: "Material (Sperrholz 3mm)",
        unit: "Stk",
        quantity: "1",
        unitAmountEuro: "8,50",
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
          Neue Rechnung erstellen
        </h1>
        <p className="text-sm text-zinc-600">
          Wenn eine Rechnung an eine natürliche oder juristische Person erstellt werden muss
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Rechnungsdaten"
          icon={faFileInvoice}
          description="Grunddaten, Datumsfelder und Zahlungsinformationen."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Zahlungsart"
              hint={
                paymentMethodsError
                  ? undefined
                  : paymentMethodsLoading
                    ? "Verfügbare Zahlungsarten werden geladen."
                    : undefined
              }
              error={paymentMethodsError ?? undefined}
            >
              <Select
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as PaymentMethod)
                }
                disabled={paymentMethodsLoading || paymentMethods.length === 0}
              >
                <option value="">
                  {paymentMethodsLoading
                    ? "Zahlungsarten werden geladen"
                    : paymentMethods.length === 0
                      ? "Keine Zahlungsarten verfügbar"
                      : "Bitte wählen"}
                </option>
                {paymentMethods.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
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

          </div>
        </FormSection>

        <FormSection
          title="Versand & Kunde"
          icon={faUser}
          description="Rechnungsempfänger, Versandoptionen und Kundendaten für die Rechnung."
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Rechnungsempfänger (Debitor)" required>
                <AutocompleteInput
                  apiPath="/api/campai/debtors"
                  entityLabelSingular="Debitor"
                  placeholder="Name eingeben…"
                  showCreateOption
                  value={debtorName}
                  onChange={(event) => {
                    setDebtorName(event.target.value);
                    setDebtorAccount(null);
                    setDebtorError(null);
                    if (!event.target.value.trim()) {
                      setShowCreateDebtorPanel(false);
                    }
                  }}
                  onSelect={handleDebtorSelect}
                  onCreateNew={handleCreateDebtor}
                />
              </FormField>

              <FormField label="E-Mail-Empfänger" hint="Für Versand und Neuanlage des Debitors.">
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="kunde@beispiel.de"
                />
              </FormField>
            </div>

            {debtorAccount ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                <span>
                  Debitor <strong>#{debtorAccount}</strong>
                  {debtorName ? ` (${debtorName})` : ""} ausgewählt
                </span>
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-emerald-600 hover:bg-emerald-100"
                  onClick={resetDebtor}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {showCreateDebtorPanel && !debtorAccount ? (
              <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900">
                    Neuen Debitor anlegen: &ldquo;{debtorName}&rdquo;
                  </p>
                  <p className="text-sm text-blue-800">
                    Für die Anlage werden die unten eingetragene Adresse und die E-Mail-Adresse verwendet.
                  </p>
                  <p className="text-xs text-blue-700">
                    Ausgewählte Zahlungsart: {paymentMethod
                      ? paymentMethods.find((item) => item.value === paymentMethod)?.label ?? paymentMethod
                      : "keine"}
                  </p>
                </div>

                {debtorError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {debtorError}
                  </div>
                ) : null}

                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    kind="primary"
                    icon={faPlus}
                    disabled={
                      isCreatingDebtor ||
                      !debtorName.trim() ||
                      !addressLine.trim() ||
                      !zip.trim() ||
                      !city.trim()
                    }
                    onClick={createDebtor}
                  >
                    {isCreatingDebtor ? "Wird angelegt…" : "Debitor anlegen"}
                  </Button>
                  <Button
                    type="button"
                    kind="secondary"
                    onClick={() => setShowCreateDebtorPanel(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : null}

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
                <FormField label="Automatischer Versand per E-Mail" required>
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
          </div>
        </FormSection>

        <FormSection
          title="Positionen"
          icon={faList}
          description="Leistungspositionen inkl. Steuern, Rabatt und Kostenstelle."
        >
          <div className="mb-4">
            <FormField label="Rechnungsgegenstand" required>
              <p className="mb-2 text-xs text-zinc-500">
                Kurze Beschreibung der gelieferten Produkte bzw. Art und Umfang der Dienstleistung
              </p>
              <Input value={intro} onChange={(event) => setIntro(event.target.value)} />
            </FormField>
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
            <div className="rounded-2xl border border-zinc-200 p-3">
              <div className="mb-2 hidden grid-cols-[minmax(200px,1fr)_86px_55px_100px_65px_110px_130px_40px] gap-2 px-1 xl:grid">
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500">Einheit</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500">Menge</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500">Einzelbetrag €</p>
                <div
                  ref={taxHintContainerRef}
                  className="group relative inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500"
                >
                  <span>Steuer</span>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-zinc-400 transition hover:text-zinc-600"
                    aria-label="Hinweis zu Steuercodes anzeigen"
                    aria-expanded={showTaxHint}
                    onClick={() => setShowTaxHint((prev) => !prev)}
                    onMouseEnter={() => setShowTaxHint(true)}
                    onMouseLeave={() => setShowTaxHint(false)}
                    onFocus={() => setShowTaxHint(true)}
                    onBlur={() => setShowTaxHint(false)}
                  >
                    <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
                  </button>
                  <span
                    className={`pointer-events-none absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-zinc-700 shadow-sm transition ${
                      showTaxHint
                        ? "visible opacity-100"
                        : "invisible opacity-0 group-hover:visible group-hover:opacity-100"
                    }`}
                  >
                    19% für reguläre Dienstleistungen/Verkäufe, 7% nur für begünstigte Leistungen, 0% für steuerfreie Positionen.
                  </span>
                </div>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500">Gesamtbetrag</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500">Kostenstelle</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-zinc-500">Aktion</p>
              </div>

              <div className="space-y-2">
                {positions.map((position) => {
                  const rowQuantity = parseQuantity(position.quantity);
                  const rowUnitAmount = parseEuroToCents(position.unitAmountEuro);
                  const rowTotal =
                    rowQuantity !== null && rowUnitAmount !== null
                      ? Math.round(rowQuantity * rowUnitAmount)
                      : null;

                  return (
                    <div
                      key={position.id}
                      className="grid gap-3 rounded-xl border border-zinc-200 p-3 md:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_86px_55px_100px_65px_110px_130px_40px] xl:items-end"
                    >
                      <FormField
                        label="Name"
                        required
                        className="md:col-span-2 xl:col-span-1"
                        labelClassName="whitespace-nowrap xl:hidden"
                      >
                        <ProductAutocompleteInput
                          aria-label="Name"
                          value={position.description}
                          onChange={(event) =>
                            updatePosition(position.id, "description", event.target.value)
                          }
                          onSelect={(suggestion) =>
                            handleProductSelect(position.id, suggestion)
                          }
                          placeholder="Name oder Produkt"
                        />
                      </FormField>

                      <FormField label="Einheit" labelClassName="whitespace-nowrap xl:hidden">
                        <Input
                          aria-label="Einheit"
                          value={position.unit}
                          onChange={(event) =>
                            updatePosition(position.id, "unit", event.target.value)
                          }
                          placeholder="Stk"
                        />
                      </FormField>

                      <FormField label="Menge" required labelClassName="whitespace-nowrap xl:hidden">
                        <Input
                          aria-label="Menge"
                          value={position.quantity}
                          inputMode="decimal"
                          onChange={(event) =>
                            updatePosition(position.id, "quantity", event.target.value)
                          }
                          placeholder="1"
                        />
                      </FormField>

                      <FormField label="Einzelbetrag €" required labelClassName="whitespace-nowrap xl:hidden">
                        <Input
                          aria-label="Einzelbetrag in Euro"
                          value={position.unitAmountEuro}
                          inputMode="decimal"
                          onChange={(event) =>
                            updatePosition(position.id, "unitAmountEuro", event.target.value)
                          }
                          placeholder="12,50"
                        />
                      </FormField>

                      <FormField label="Steuer" labelClassName="whitespace-nowrap xl:hidden">
                        <Select
                          aria-label="Steuer"
                          value={position.taxCode}
                          onChange={(event) =>
                            updatePosition(position.id, "taxCode", event.target.value)
                          }
                        >
                          <option value="">-</option>
                          <option value="0">0%</option>
                          <option value="7">7%</option>
                          <option value="19">19%</option>
                        </Select>
                      </FormField>

                      <FormField label="Gesamtbetrag" labelClassName="whitespace-nowrap xl:hidden">
                        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-900">
                          {rowTotal === null ? "-" : `€${(rowTotal / 100).toFixed(2)}`}
                        </div>
                      </FormField>

                      <FormField
                        label="Kostenstelle"
                        className="md:col-span-2 xl:col-span-1"
                        labelClassName="whitespace-nowrap xl:hidden"
                      >
                        <Select
                          aria-label="Kostenstelle"
                          value={position.costCenter1}
                          onChange={(event) =>
                            updatePosition(position.id, "costCenter1", event.target.value)
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

                      <div className="space-y-2 xl:space-y-0">
                        <p className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 xl:hidden">
                          Aktion
                        </p>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 xl:self-end"
                          aria-label="Position entfernen"
                          title="Position entfernen"
                          onClick={() => removePosition(position.id)}
                          disabled={positions.length === 1}
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Button type="button" icon={faPlus} onClick={addPosition}>
              Position hinzufügen
            </Button>

            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-700">Gesamtbetrag</span>
                <span className="text-lg font-semibold text-zinc-900">
                  €{(totalCents / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <FormField label="Rechnungsart" required>
              <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setIsNet(true)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isNet
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Netto
                </button>
                <button
                  type="button"
                  onClick={() => setIsNet(false)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    !isNet
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Brutto
                </button>
              </div>
            </FormField>
          </div>
        </FormSection>

        <FormSection
          title="Interne Notiz"
          icon={faFileInvoice}
          description="Interner Hinweis zur Rechnung (optional)."
        >
          <FormField label="Interne Notiz">
            <Textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </FormField>
        </FormSection>

        <div className="sticky bottom-4 z-20 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            {errorMessage ? (
              <p className="text-sm text-rose-700">{errorMessage}</p>
            ) : null}
            {successMessage ? (
              <p className="text-sm text-emerald-700">{successMessage}</p>
            ) : null}
            <p className="text-sm text-zinc-700">
              Gültige Positionen: <span className="font-semibold text-zinc-900">{validPositions.length}</span>
            </p>
            <p className="text-sm text-zinc-700">
              Gesamtbetrag: <span className="font-semibold text-zinc-900">€{(totalCents / 100).toFixed(2)}</span>
            </p>

            <Button
              type="button"
              kind="secondary"
              icon={faRotate}
              onClick={fillWithTestData}
              disabled={submitting}
            >
              Mit Testdaten füllen
            </Button>

            <Button type="submit" kind="primary" disabled={submitting} className="ml-auto">
              {submitting ? "Rechnung wird erstellt..." : "Rechnung erstellen"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
