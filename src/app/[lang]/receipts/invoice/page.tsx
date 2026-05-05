"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faCheck,
  faFileInvoice,
  faList,
  faPlus,
  faTrash,
  faTriangleExclamation,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "../../components/Button";
import BookingPageShell from "../../components/ui/BookingPageShell";
import InternalNoteSection from "../../components/ui/InternalNoteSection";
import {
  AutocompleteInput,
  type Suggestion as DebtorSuggestion,
} from "../../components/ui/autocomplete-input";
import DebtorCreatePanel from "../../components/ui/debtor-create-panel";
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
import {
  euroAmountValidationMessage,
} from "@/lib/euro-input";
import ReceiptsPageHeader from "../receiptsPageHeader";

type InvoicePosition = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  unitAmountEuro: string;
  taxCode: "" | "0" | "7" | "19";
  costCenter2: string;
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

type BankConnectionOption = {
  value: string;
  label: string;
  account?: string;
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
  taxCode: "0",
  costCenter2: "",
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

  return "0";
};

const getTaxRatePercent = (value: InvoiceTaxCode) => {
  if (value === "7" || value === "19") {
    return Number(value);
  }

  return 0;
};

const getDefaultPaymentMethod = (items: PaymentMethodOption[]): PaymentMethod => {
  const preferred = CAMPAI_PAYMENT_METHOD_TYPES.find((value) =>
    items.some((item) => item.value === value),
  );
  return preferred ?? items[0]?.value ?? "";
};

const DEFAULT_COST_CENTER2 = "50";
const DEFAULT_TRANSFER_ACCOUNT = "17100";

const getDefaultCostCenter2 = (items: CostCenterOption[]) => {
  const preferred = items.find((item) => item.value === DEFAULT_COST_CENTER2);
  return preferred?.value ?? items[0]?.value ?? "";
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
  const [bankConnections, setBankConnections] = useState<BankConnectionOption[]>([]);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState("");
  const [bankConnectionsLoading, setBankConnectionsLoading] = useState(false);
  const [bankConnectionsError, setBankConnectionsError] = useState<string | null>(null);
  const [hasLoadedBankConnections, setHasLoadedBankConnections] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [debtorAccount, setDebtorAccount] = useState<number | null>(null);
  const [debtorName, setDebtorName] = useState("");
  const [showCreateDebtorPanel, setShowCreateDebtorPanel] = useState(false);
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
          const defaultValue = getDefaultCostCenter2(items);
          setPositions((prev) =>
            prev.map((position) =>
              position.costCenter2
                ? position
                : { ...position, costCenter2: defaultValue },
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

  useEffect(() => {
    if (paymentMethod !== "sepaCreditTransfer" || hasLoadedBankConnections) {
      return;
    }

    let active = true;

    const loadBankConnections = async () => {
      try {
        setBankConnectionsLoading(true);
        const response = await fetchJson<{
          bankConnections: BankConnectionOption[];
        }>("/api/campai/bank-connections");

        if (!active) {
          return;
        }

        const items = response.bankConnections ?? [];
        setBankConnections(items);
        setBankConnectionsError(
          items.length === 0
            ? "Es wurden keine Konten in Campai gefunden."
            : null,
        );
        setSelectedCashAccountId((current) => {
          if (current && items.some((item) => item.value === current)) {
            return current;
          }

          const preferredAccount = items.find(
            (item) => item.account === DEFAULT_TRANSFER_ACCOUNT,
          );

          if (preferredAccount) {
            return preferredAccount.value;
          }

          return items.length === 1 ? items[0].value : "";
        });
        setHasLoadedBankConnections(true);
      } catch (error) {
        if (!active) {
          return;
        }

        setBankConnections([]);
        setBankConnectionsError(
          error instanceof Error
            ? error.message
            : "Konten konnten nicht geladen werden.",
        );
      } finally {
        if (active) {
          setBankConnectionsLoading(false);
        }
      }
    };

    loadBankConnections();

    return () => {
      active = false;
    };
  }, [hasLoadedBankConnections, paymentMethod]);

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
          !position.taxCode ||
          !position.costCenter2
        ) {
          return null;
        }
        return {
          description,
          unit: position.unit.trim(),
          quantity,
          unitAmount,
          taxCode: position.taxCode,
          costCenter2: position.costCenter2 || undefined,
          discount: parsePercent(position.discountPercent),
        };
      })
      .filter((position): position is NonNullable<typeof position> =>
        Boolean(position),
      );
  }, [positions]);

  const totals = useMemo(() => {
    return validPositions.reduce(
      (sum, position) => {
        const lineAmountCents = Math.round(position.quantity * position.unitAmount);
        const taxRate = getTaxRatePercent(position.taxCode);

        if (isNet) {
          const taxCents = Math.round((lineAmountCents * taxRate) / 100);
          sum.enteredTotalCents += lineAmountCents;
          sum.netTotalCents += lineAmountCents;
          sum.taxTotalCents += taxCents;
          sum.grossTotalCents += lineAmountCents + taxCents;
          return sum;
        }

        const taxCents =
          taxRate > 0
            ? Math.round((lineAmountCents * taxRate) / (100 + taxRate))
            : 0;
        const netCents = lineAmountCents - taxCents;

        sum.enteredTotalCents += lineAmountCents;
        sum.netTotalCents += netCents;
        sum.taxTotalCents += taxCents;
        sum.grossTotalCents += lineAmountCents;
        return sum;
      },
      {
        enteredTotalCents: 0,
        netTotalCents: 0,
        taxTotalCents: 0,
        grossTotalCents: 0,
      },
    );
  }, [isNet, validPositions]);

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
          costCenter2: suggestion.costCenter2 ?? position.costCenter2,
        };
      }),
    );
  };

  const addPosition = () => {
    setPositions((prev) => [
      ...prev,
      {
        ...createPosition(),
        costCenter2: getDefaultCostCenter2(costCenters),
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

    if (!invoiceDate) {
      setErrorMessage("Bitte ein Rechnungsdatum eintragen.");
      return;
    }

    if (!debtorAccount) {
      setErrorMessage("Bitte einen Debitor auswählen oder inline anlegen.");
      return;
    }

    if (paymentMethod === "sepaCreditTransfer" && !selectedCashAccountId) {
      setErrorMessage("Bitte ein Konto für Überweisung auswählen.");
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
      const statusNoteLine = `Status: ${paid ? "bezahlt" : "offen"}`;
      const internalNote = [note.trim(), statusNoteLine]
        .filter(Boolean)
        .join("\n");

      const response = await fetchJson<{ id: string | null }>(
        "/api/campai/receipts/invoice",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intro: intro.trim(),
            internalNote: internalNote || undefined,
            sendByMail,
            recipientEmail: recipientEmail.trim() || undefined,
            debtorName: debtorName.trim(),
            customerNumber: debtorAccount,
            paid,
            paymentMethod: paymentMethod || undefined,
            paymentCashAccountId:
              paymentMethod === "sepaCreditTransfer"
                ? selectedCashAccountId || undefined
                : undefined,
            invoiceDate,
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

  return (
    <BookingPageShell>
      <ReceiptsPageHeader
        title="Neue Rechnung erstellen"
        description="Wenn eine Rechnung an eine natürliche oder juristische Person erstellt werden muss."
        helperText="Pflichtfelder und Rechnungsdaten lassen sich hier in derselben Struktur wie auf den anderen Buchungsseiten erfassen."
        icon={<FontAwesomeIcon icon={faFileInvoice} className="h-5 w-5" />}
        iconClassName="border-blue-200 bg-blue-50 text-blue-600 shadow-sm"
      />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
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
              <div className="flex items-center gap-2 rounded-lg border border-success-border bg-success-soft px-3 py-2 text-sm text-success">
                <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                <span>
                  Debitor <strong>#{debtorAccount}</strong>
                  {debtorName ? ` (${debtorName})` : ""} ausgewählt
                </span>
                <button
                  type="button"
                  className="ml-auto rounded p-1 text-success hover:bg-success-soft"
                  onClick={resetDebtor}
                >
                  <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            {showCreateDebtorPanel && !debtorAccount ? (
              <DebtorCreatePanel
                initialName={debtorName}
                initialType="person"
                initialDetails={details1}
                initialAddressLine={addressLine}
                initialZip={zip}
                initialCity={city}
                email={recipientEmail}
                paymentMethodType={paymentMethod || undefined}
                receiptSendMethod={recipientEmail.trim()
                  ? sendByMail
                    ? "email"
                    : "postal"
                  : "postal"}
                onCancel={() => setShowCreateDebtorPanel(false)}
                onCreated={(result, draft) => {
                  setDebtorAccount(result.account);
                  setDebtorName(result.name);
                  setShowCreateDebtorPanel(false);
                  setDebtorError(null);
                  setAddressLine(draft.addressLine);
                  setZip(draft.zip);
                  setCity(draft.city);
                  setDetails1(draft.details);

                  if (
                    result.paymentMethodType &&
                    paymentMethods.some(
                      (item) => item.value === result.paymentMethodType,
                    )
                  ) {
                    setPaymentMethod(result.paymentMethodType as PaymentMethod);
                  }
                }}
              />
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 rounded-2xl border border-border p-3">
              <label className="inline-flex items-center gap-2 text-sm text-foreground/80">
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
          description="Leistungspositionen inkl. Steuern, Rabatt und Bereich/Projekt."
        >
          <div className="mb-4">
            <FormField label="Rechnungsgegenstand" required>
              <p className="mb-2 text-xs text-muted-foreground">
                Kurze Beschreibung der gelieferten Produkte bzw. Art und Umfang der Dienstleistung
              </p>
              <Input value={intro} onChange={(event) => setIntro(event.target.value)} />
            </FormField>
          </div>

          {showCostCenterWarning ? (
            <div className="mb-4 rounded-xl border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning">
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
            <div className="rounded-2xl border border-border p-3">
              <div className="mb-2 hidden grid-cols-[minmax(200px,1fr)_86px_55px_100px_65px_110px_130px_40px] gap-2 px-1 xl:grid">
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Einheit</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Menge</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Einzelbetrag €</p>
                <div
                  ref={taxHintContainerRef}
                  className="group relative inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <span>Steuer</span>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground/80 transition hover:text-muted-foreground"
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
                    className={`pointer-events-none absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-foreground/80 shadow-sm transition ${
                      showTaxHint
                        ? "visible opacity-100"
                        : "invisible opacity-0 group-hover:visible group-hover:opacity-100"
                    }`}
                  >
                    19% für reguläre Dienstleistungen/Verkäufe, 7% nur für begünstigte Leistungen, 0% für steuerfreie Positionen.
                  </span>
                </div>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gesamtbetrag</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bereich/Projekt</p>
                <p className="truncate whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aktion</p>
              </div>

              <div className="space-y-2">
                {positions.map((position) => {
                  const rowQuantity = parseQuantity(position.quantity);
                  const rowUnitAmount = parseEuroToCents(position.unitAmountEuro);
                  const rowEnteredTotal =
                    rowQuantity !== null && rowUnitAmount !== null
                      ? Math.round(rowQuantity * rowUnitAmount)
                      : null;

                  return (
                    <div
                      key={position.id}
                      className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-2 xl:grid-cols-[minmax(200px,1fr)_86px_55px_100px_65px_110px_130px_40px] xl:items-end"
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
                          title={euroAmountValidationMessage}
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
                          <option value="0">0%</option>
                          <option value="7">7%</option>
                          <option value="19">19%</option>
                        </Select>
                      </FormField>

                      <FormField label="Gesamtbetrag" labelClassName="whitespace-nowrap xl:hidden">
                        <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">
                          {rowEnteredTotal === null ? "-" : `€${(rowEnteredTotal / 100).toFixed(2)}`}
                        </div>
                      </FormField>

                      <FormField
                        label="Bereich/Projekt"
                        className="md:col-span-2 xl:col-span-1"
                        labelClassName="whitespace-nowrap xl:hidden"
                      >
                        <Select
                          aria-label="Bereich/Projekt"
                          value={position.costCenter2}
                          onChange={(event) =>
                            updatePosition(position.id, "costCenter2", event.target.value)
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
                        <p className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground xl:hidden">
                          Aktion
                        </p>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive-border bg-card text-destructive transition hover:bg-destructive-soft disabled:cursor-not-allowed disabled:opacity-60 xl:self-end"
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

            <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm text-foreground/80">
                  <span>{isNet ? "Nettosumme" : "Bruttosumme"}</span>
                  <span className="font-medium text-foreground">
                    €{(totals.enteredTotalCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm text-foreground/80">
                  <span>{isNet ? "MwSt." : "Enthaltene MwSt."}</span>
                  <span className="font-medium text-foreground">
                    €{(totals.taxTotalCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground/80">Gesamtbetrag</span>
                  <span className="text-lg font-semibold text-foreground">
                    €{(totals.grossTotalCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <FormField label="Rechnungsart" required>
              <div className="inline-flex rounded-xl border border-border bg-accent p-1">
                <button
                  type="button"
                  onClick={() => setIsNet(true)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isNet
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Nettopreise
                </button>
                <button
                  type="button"
                  onClick={() => setIsNet(false)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    !isNet
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Bruttopreise
                </button>
              </div>
            </FormField>
          </div>
        </FormSection>

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

            {paymentMethod === "sepaCreditTransfer" ? (
              <FormField
                label="Konto"
                required
                hint={
                  bankConnectionsError
                    ? undefined
                    : bankConnectionsLoading
                      ? "Konten werden geladen."
                      : undefined
                }
                error={bankConnectionsError ?? undefined}
              >
                <Select
                  value={selectedCashAccountId}
                  onChange={(event) =>
                    setSelectedCashAccountId(event.target.value)
                  }
                  disabled={
                    bankConnectionsLoading || bankConnections.length === 0
                  }
                >
                  <option value="">
                    {bankConnectionsLoading
                      ? "Konten werden geladen"
                      : bankConnections.length === 0
                        ? "Keine Konten verfügbar"
                        : "Bitte Konto wählen"}
                  </option>
                  {bankConnections.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <div className="hidden md:block" />
            )}

            <FormField label="Rechnungsdatum" required>
              <Input
                type="date"
                required
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
              <label className="inline-flex h-10 items-center gap-2 text-sm text-foreground/80">
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

        <InternalNoteSection
          fieldLabel="Interne Notiz"
          textareaProps={{
            value: note,
            onChange: (event) => setNote(event.target.value),
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto flex flex-wrap items-center gap-3">
            {errorMessage ? (
              <p className="text-sm text-destructive">{errorMessage}</p>
            ) : null}
            {successMessage ? (
              <p className="text-sm text-success">{successMessage}</p>
            ) : null}
            <p className="text-sm text-foreground/80">
              Gültige Positionen: <span className="font-semibold text-foreground">{validPositions.length}</span>
            </p>
            <p className="text-sm text-foreground/80">
              MwSt.: <span className="font-semibold text-foreground">€{(totals.taxTotalCents / 100).toFixed(2)}</span>
            </p>
            <p className="text-sm text-foreground/80">
              Gesamtbetrag: <span className="font-semibold text-foreground">€{(totals.grossTotalCents / 100).toFixed(2)}</span>
            </p>
          </div>

          <div className="ml-auto flex items-center justify-end gap-3">
            <Button type="button" kind="secondary" href="/receipts">
              Abbrechen
            </Button>
            <Button type="submit" kind="primary" disabled={submitting}>
              {submitting ? "Rechnung wird erstellt..." : "Rechnung erstellen"}
            </Button>
          </div>
        </div>
      </form>
    </BookingPageShell>
  );
}
