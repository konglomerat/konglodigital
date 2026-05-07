"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faXmark,
  faDownload,
} from "@fortawesome/free-solid-svg-icons";

import ReactSelect from "@/app/[lang]/components/ui/react-select";

type CostCenterOption = {
  value: string;
  label: string;
};

const CREATE_COST_CENTER_OPTION: CostCenterOption = {
  value: "__create__",
  label: "Neu anlegen",
};

type ReceiptPositionDetail = {
  account: number | null;
  costCenter1: number | null;
  costCenter2: number | null;
  amount: number | null;
  taxCode: string | null;
  description: string;
  details: string | null;
  quantity: number | null;
  unit: string | null;
  unitAmount: number | null;
};

type ReceiptNoteDetail = {
  id: string;
  content: string;
  writtenAt: string | null;
  writtenByName: string | null;
};

type ReceiptDetail = {
  id: string;
  type: string | null;
  receiptNumber: string | null;
  receiptDate: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
  account: number | null;
  accountName: string | null;
  description: string;
  paymentStatus: string | null;
  totalGrossAmount: number | null;
  totalAmountLeftToPay: number | null;
  isNet: boolean;
  refund: boolean;
  tags: string[];
  notes: ReceiptNoteDetail[];
  positions: ReceiptPositionDetail[];
  isCashLinked: boolean;
  raw: Record<string, unknown>;
};

const TYPE_LABELS: Record<string, string> = {
  expense: "Ausgabe",
  revenue: "Einnahme",
  invoice: "Rechnung",
  deposit: "Einzahlung",
  donation: "Spende",
  confirmation: "Bestätigung",
  refund: "Rückerstattung",
  offer: "Angebot",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Unbezahlt",
  partial: "Teilweise bezahlt",
  paid: "Bezahlt",
};

const formatCents = (cents: number | null): string => {
  if (cents === null) {
    return "—";
  }
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}${euros.toLocaleString("de-DE")},${String(rest).padStart(2, "0")} €`;
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${day}.${month}.${year}`;
};

const formatDateTime = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${formatDate(value)} ${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
};

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeReceipt = (raw: Record<string, unknown>): ReceiptDetail => {
  const positionsRaw = Array.isArray(raw.positions) ? raw.positions : [];
  const notesRaw = Array.isArray(raw.notes) ? raw.notes : [];
  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
  const paymentsRaw = Array.isArray(raw.payments) ? raw.payments : [];
  const isCashLinked = paymentsRaw.some(
    (payment) =>
      typeof payment === "object" &&
      payment !== null &&
      typeof (payment as Record<string, unknown>).cashTransaction === "string" &&
      ((payment as Record<string, unknown>).cashTransaction as string).length > 0,
  );

  return {
    id: typeof raw._id === "string" ? raw._id : "",
    type: toStringOrNull(raw.type),
    receiptNumber: toStringOrNull(raw.receiptNumber),
    receiptDate: toStringOrNull(raw.receiptDate),
    dueDate: toStringOrNull(raw.dueDate),
    paidAt: toStringOrNull(raw.paidAt),
    createdAt: toStringOrNull(raw.createdAt),
    account: toNumberOrNull(raw.account),
    accountName: toStringOrNull(raw.accountName),
    description: typeof raw.description === "string" ? raw.description : "",
    paymentStatus: toStringOrNull(raw.paymentStatus),
    totalGrossAmount: toNumberOrNull(raw.totalGrossAmount),
    totalAmountLeftToPay: toNumberOrNull(raw.totalAmountLeftToPay),
    isNet: Boolean(raw.isNet),
    refund: Boolean(raw.refund),
    tags: tagsRaw.filter((tag): tag is string => typeof tag === "string"),
    notes: notesRaw
      .filter((note): note is Record<string, unknown> => typeof note === "object" && note !== null)
      .map((note) => {
        const writtenBy =
          typeof note.writtenBy === "object" && note.writtenBy !== null
            ? (note.writtenBy as Record<string, unknown>)
            : {};
        return {
          id: typeof note.id === "string" ? note.id : "",
          content: typeof note.content === "string" ? note.content : "",
          writtenAt: toStringOrNull(note.writtenAt),
          writtenByName: toStringOrNull(writtenBy.name),
        };
      }),
    positions: positionsRaw
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map((position) => ({
        account: toNumberOrNull(position.account),
        costCenter1: toNumberOrNull(position.costCenter1),
        costCenter2: toNumberOrNull(position.costCenter2),
        amount: toNumberOrNull(position.amount),
        taxCode: toStringOrNull(position.taxCode),
        description: typeof position.description === "string" ? position.description : "",
        details: toStringOrNull(position.details),
        quantity: toNumberOrNull(position.quantity),
        unit: toStringOrNull(position.unit),
        unitAmount: toNumberOrNull(position.unitAmount),
      })),
    isCashLinked,
    raw,
  };
};

type ReceiptDetailDrawerProps = {
  receiptId: string | null;
  costCenterOptions: CostCenterOption[];
  onClose: () => void;
  onCostCentersChanged?: () => Promise<void> | void;
  onSaved?: (receiptId: string) => void;
};

const isEditableType = (type: string | null): boolean =>
  type === "expense" || type === "revenue" || type === "invoice";

const isCreateCostCenterOption = (
  option: CostCenterOption | null | undefined,
): boolean => option?.value === CREATE_COST_CENTER_OPTION.value;

const formatCostCenterOptionLabel = (option: CostCenterOption) => {
  if (isCreateCostCenterOption(option)) {
    return (
      <span className="font-medium text-foreground">{option.label}</span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground">{option.value}</span>
      <span>{option.label}</span>
    </span>
  );
};

export default function ReceiptDetailDrawer({
  receiptId,
  costCenterOptions,
  onClose,
  onCostCentersChanged,
  onSaved,
}: ReceiptDetailDrawerProps) {
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerEntered, setDrawerEntered] = useState(false);
  const [drawerCostCenterOptions, setDrawerCostCenterOptions] =
    useState<CostCenterOption[]>(costCenterOptions);
  const [description, setDescription] = useState("");
  const [positionEdits, setPositionEdits] = useState<
    Array<{ description: string; costCenter2: number | null }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [creatingCostCenterForIndex, setCreatingCostCenterForIndex] = useState<number | null>(null);
  const [newCostCenterNumber, setNewCostCenterNumber] = useState("");
  const [newCostCenterLabel, setNewCostCenterLabel] = useState("");
  const [creatingCostCenter, setCreatingCostCenter] = useState(false);
  const [createCostCenterError, setCreateCostCenterError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [createNoteError, setCreateNoteError] = useState<string | null>(null);

  const isOpen = receiptId !== null;

  useEffect(() => {
    setDrawerCostCenterOptions(costCenterOptions);
  }, [costCenterOptions]);

  useEffect(() => {
    if (!isOpen || !receiptId) {
      setDrawerEntered(false);
      setDetail(null);
      setError(null);
      setSaveError(null);
      setDrawerCostCenterOptions(costCenterOptions);
      setCreatingCostCenterForIndex(null);
      setNewCostCenterNumber("");
      setNewCostCenterLabel("");
      setCreateCostCenterError(null);
      setCreatingCostCenter(false);
      setNewNote("");
      setCreatingNote(false);
      setCreateNoteError(null);
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setDrawerEntered(true);
    });

    let active = true;
    setLoading(true);
    setError(null);
    setSaveError(null);
    setCreateNoteError(null);
    setDetail(null);

    const load = async () => {
      try {
        const response = await fetch(
          `/api/campai/balance/receipts/${receiptId}`,
        );
        const data = (await response.json()) as {
          receipt?: Record<string, unknown>;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? `Fehler ${response.status}`);
        }
        if (!active) {
          return;
        }
        if (data.receipt) {
          const normalized = normalizeReceipt(data.receipt);
          setDetail(normalized);
          setDescription(normalized.description);
          setPositionEdits(
            normalized.positions.map((position) => ({
              description: position.description ?? "",
              costCenter2: position.costCenter2,
            })),
          );
        }
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Beleg konnte nicht geladen werden.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      active = false;
    };
  }, [costCenterOptions, isOpen, receiptId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const costCenterOptionMap = useMemo(() => {
    const map = new Map<string, CostCenterOption>();
    for (const option of drawerCostCenterOptions) {
      map.set(option.value, option);
    }
    return map;
  }, [drawerCostCenterOptions]);

  const selectableCostCenterOptions = useMemo(
    () => [...drawerCostCenterOptions, CREATE_COST_CENTER_OPTION],
    [drawerCostCenterOptions],
  );

  const editable =
    detail !== null && isEditableType(detail.type) && !detail.isCashLinked;

  const isDirty = useMemo(() => {
    if (!detail) {
      return false;
    }
    if (description !== detail.description) {
      return true;
    }
    if (positionEdits.length !== detail.positions.length) {
      return true;
    }
    return positionEdits.some((edit, index) => {
      const original = detail.positions[index];
      if (!original) return true;
      const originalDescription = original.description ?? "";
      if (edit.description !== originalDescription) return true;
      if (edit.costCenter2 !== original.costCenter2) return true;
      return false;
    });
  }, [description, detail, positionEdits]);

  const handleSave = useCallback(async () => {
    if (!detail || !receiptId || !editable) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(
        `/api/campai/balance/receipts/${receiptId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            positions: positionEdits.map((edit) => ({
              description: edit.description,
              costCenter2: edit.costCenter2,
            })),
          }),
        },
      );
      const data = (await response.json()) as {
        receipt?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? `Fehler ${response.status}`);
      }
      if (data.receipt) {
        const normalized = normalizeReceipt(data.receipt);
        setDetail(normalized);
        setDescription(normalized.description);
        setPositionEdits(
          normalized.positions.map((position) => ({
            description: position.description ?? "",
            costCenter2: position.costCenter2,
          })),
        );
      }
      onSaved?.(receiptId);
    } catch (saveErr) {
      setSaveError(
        saveErr instanceof Error
          ? saveErr.message
          : "Speichern fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  }, [description, detail, editable, onSaved, positionEdits, receiptId]);

  const handleCreateCostCenter = useCallback(async () => {
    if (creatingCostCenterForIndex === null) {
      return;
    }

    const parsedNumber = Number.parseInt(newCostCenterNumber.trim(), 10);
    const trimmedLabel = newCostCenterLabel.trim();

    if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
      setCreateCostCenterError("Bitte eine gueltige Werkbereich-Nummer eingeben.");
      return;
    }

    if (!trimmedLabel) {
      setCreateCostCenterError("Bitte einen Namen fuer den Werkbereich eingeben.");
      return;
    }

    setCreatingCostCenter(true);
    setCreateCostCenterError(null);

    try {
      const response = await fetch("/api/campai/cost-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: parsedNumber,
          label: trimmedLabel,
          bookable: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        costCenter?: CostCenterOption;
        costCenters?: CostCenterOption[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Werkbereich konnte nicht angelegt werden.");
      }

      const createdOption = data.costCenter ?? {
        value: String(parsedNumber),
        label: trimmedLabel,
      };
      const nextOptions = data.costCenters ?? [...drawerCostCenterOptions, createdOption];
      setDrawerCostCenterOptions(nextOptions);
      setPositionEdits((current) => {
        const draft = [...current];
        const existing = draft[creatingCostCenterForIndex] ?? {
          description: detail?.positions[creatingCostCenterForIndex]?.description ?? "",
          costCenter2: null,
        };
        draft[creatingCostCenterForIndex] = {
          ...existing,
          costCenter2: parsedNumber,
        };
        return draft;
      });
      setCreatingCostCenterForIndex(null);
      setNewCostCenterNumber("");
      setNewCostCenterLabel("");
      setCreateCostCenterError(null);

      if (onCostCentersChanged) {
        try {
          await onCostCentersChanged();
        } catch {
          // Keep the local list even if the parent refresh fails.
        }
      }
    } catch (createError) {
      setCreateCostCenterError(
        createError instanceof Error
          ? createError.message
          : "Werkbereich konnte nicht angelegt werden.",
      );
    } finally {
      setCreatingCostCenter(false);
    }
  }, [
    creatingCostCenterForIndex,
    detail,
    drawerCostCenterOptions,
    newCostCenterLabel,
    newCostCenterNumber,
    onCostCentersChanged,
  ]);

  const handleCreateNote = useCallback(async () => {
    if (!detail || !receiptId) {
      return;
    }

    const content = newNote.trim();
    if (!content) {
      setCreateNoteError("Bitte eine Notiz eingeben.");
      return;
    }

    setCreatingNote(true);
    setCreateNoteError(null);

    try {
      const response = await fetch(`/api/campai/balance/receipts/${receiptId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        receipt?: Record<string, unknown>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Notiz konnte nicht gespeichert werden.");
      }

      if (data.receipt) {
        setDetail(normalizeReceipt(data.receipt));
      }

      setNewNote("");
    } catch (createError) {
      setCreateNoteError(
        createError instanceof Error
          ? createError.message
          : "Notiz konnte nicht gespeichert werden.",
      );
    } finally {
      setCreatingNote(false);
    }
  }, [detail, newNote, receiptId]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Belegdetails"
    >
      <button
        type="button"
        onClick={onClose}
        className="flex-1 cursor-default bg-transparent"
        aria-label="Schließen"
      />
      <aside
        className={`relative flex h-full w-full max-w-[640px] flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-100 ease-out dark:bg-zinc-900 ${drawerEntered ? "translate-x-0" : "translate-x-6"}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {detail?.type ? TYPE_LABELS[detail.type] ?? detail.type : "Beleg"}
            </p>
            <h2 className="truncate text-lg font-semibold text-foreground">
              {detail?.receiptNumber || "Beleg-Details"}
            </h2>
            {detail?.accountName ? (
              <p className="truncate text-sm text-muted-foreground">
                {detail.accountName}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {receiptId ? (
              <a
                href={`/api/campai/balance/receipts/${receiptId}/download`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground/80 transition hover:bg-accent hover:text-accent-foreground"
                title="PDF herunterladen"
                aria-label="PDF herunterladen"
              >
                <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground/80 transition hover:bg-accent hover:text-accent-foreground"
              aria-label="Schließen"
            >
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />
              Beleg wird geladen…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : detail ? (
            <div className="space-y-6">
              <section className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <DetailRow label="Belegnummer" value={detail.receiptNumber ?? "—"} />
                <DetailRow
                  label="Status"
                  value={
                    detail.paymentStatus
                      ? PAYMENT_STATUS_LABELS[detail.paymentStatus.toLowerCase()] ??
                        detail.paymentStatus
                      : "—"
                  }
                />
                <DetailRow label="Beleg-Datum" value={formatDate(detail.receiptDate)} />
                <DetailRow label="Fälligkeit" value={formatDate(detail.dueDate)} />
                <DetailRow label="Bezahlt am" value={formatDate(detail.paidAt)} />
                <DetailRow label="Erstellt" value={formatDateTime(detail.createdAt)} />
                <DetailRow
                  label="Brutto"
                  value={formatCents(detail.totalGrossAmount)}
                />
                <DetailRow
                  label="Offen"
                  value={formatCents(detail.totalAmountLeftToPay)}
                />
                <DetailRow
                  label="Konto"
                  value={
                    detail.account !== null
                      ? `${detail.account}${detail.accountName ? ` · ${detail.accountName}` : ""}`
                      : detail.accountName ?? "—"
                  }
                />
                <DetailRow label="Netto/Brutto" value={detail.isNet ? "Netto" : "Brutto"} />
              </section>

              {detail.isCashLinked ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  Dieser Beleg ist mit einer Zahlung verknüpft und kann nicht über
                  die Übersicht bearbeitet werden. Bitte direkt in Campai anpassen.
                </div>
              ) : null}

              <section>
                <SectionTitle>Beschreibung</SectionTitle>
                {editable ? (
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={140}
                    rows={2}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30"
                    placeholder="Beschreibung"
                  />
                ) : (
                  <p className="whitespace-pre-wrap rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground">
                    {detail.description || "—"}
                  </p>
                )}
              </section>

              <section>
                <SectionTitle>Positionen</SectionTitle>
                <div className="space-y-3">
                  {detail.positions.map((position, index) => {
                    const edit = positionEdits[index] ?? {
                      description: position.description ?? "",
                      costCenter2: position.costCenter2,
                    };
                    const costCenter2Value =
                      edit.costCenter2 !== null
                        ? costCenterOptionMap.get(String(edit.costCenter2)) ?? {
                            value: String(edit.costCenter2),
                            label: String(edit.costCenter2),
                          }
                        : null;

                    return (
                      <div
                        key={`position-${index}`}
                        className="rounded-lg border border-border bg-card p-3"
                      >
                        <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-semibold text-foreground">
                            Position {index + 1}
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatCents(position.amount)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <div>
                            <span className="font-medium text-foreground/70">Konto:</span>{" "}
                            {position.account ?? "—"}
                          </div>
                          <div>
                            <span className="font-medium text-foreground/70">
                              Sphäre:
                            </span>{" "}
                            {position.costCenter1 ?? "—"}
                          </div>
                          {position.taxCode ? (
                            <div>
                              <span className="font-medium text-foreground/70">
                                Steuerschlüssel:
                              </span>{" "}
                              {position.taxCode}
                            </div>
                          ) : null}
                          {position.quantity !== null ? (
                            <div>
                              <span className="font-medium text-foreground/70">Menge:</span>{" "}
                              {position.quantity}
                              {position.unit ? ` ${position.unit}` : ""}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-2">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Beschreibung
                          </label>
                          {editable ? (
                            <textarea
                              value={edit.description}
                              onChange={(event) => {
                                const value = event.target.value;
                                setPositionEdits((current) => {
                                  const next = [...current];
                                  next[index] = { ...next[index], description: value };
                                  return next;
                                });
                              }}
                              maxLength={200}
                              rows={2}
                              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30"
                              placeholder="Positionsbeschreibung"
                            />
                          ) : (
                            <p className="whitespace-pre-wrap rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground">
                              {position.description || "—"}
                            </p>
                          )}
                        </div>
                        <div className="mt-3 space-y-2">
                          <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Werkbereich/Projekt
                          </label>
                          {editable ? (
                            <>
                              <ReactSelect<CostCenterOption>
                                isClearable
                                options={selectableCostCenterOptions}
                                value={costCenter2Value}
                                onChange={(value) => {
                                  if (isCreateCostCenterOption(value)) {
                                    setCreatingCostCenterForIndex(index);
                                    setNewCostCenterNumber("");
                                    setNewCostCenterLabel("");
                                    setCreateCostCenterError(null);
                                    return;
                                  }

                                  const next = value
                                    ? Number.parseInt(value.value, 10)
                                    : null;
                                  setPositionEdits((current) => {
                                    const draft = [...current];
                                    draft[index] = {
                                      ...draft[index],
                                      costCenter2:
                                        next !== null && Number.isFinite(next)
                                          ? next
                                          : null,
                                    };
                                    return draft;
                                  });
                                  if (creatingCostCenterForIndex === index) {
                                    setCreatingCostCenterForIndex(null);
                                    setNewCostCenterNumber("");
                                    setNewCostCenterLabel("");
                                    setCreateCostCenterError(null);
                                  }
                                }}
                                formatOptionLabel={formatCostCenterOptionLabel}
                                placeholder="Werkbereich auswählen…"
                                noOptionsMessage={() => "Keine Werkbereiche gefunden."}
                              />
                              {creatingCostCenterForIndex === index ? (
                                <div className="space-y-2 rounded-md border border-border bg-secondary/20 p-3">
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={newCostCenterNumber}
                                      onChange={(event) => setNewCostCenterNumber(event.target.value)}
                                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30"
                                      placeholder="Nummer"
                                    />
                                    <input
                                      type="text"
                                      value={newCostCenterLabel}
                                      onChange={(event) => setNewCostCenterLabel(event.target.value)}
                                      maxLength={32}
                                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30"
                                      placeholder="Name"
                                    />
                                  </div>
                                  {createCostCenterError ? (
                                    <p className="text-xs text-destructive">{createCostCenterError}</p>
                                  ) : null}
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCreatingCostCenterForIndex(null);
                                        setNewCostCenterNumber("");
                                        setNewCostCenterLabel("");
                                        setCreateCostCenterError(null);
                                      }}
                                      disabled={creatingCostCenter}
                                      className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Abbrechen
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCreateCostCenter}
                                      disabled={creatingCostCenter}
                                      className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {creatingCostCenter ? (
                                        <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
                                      ) : null}
                                      Werkbereich speichern
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground">
                              {position.costCenter2 !== null
                                ? costCenterOptionMap.get(
                                    String(position.costCenter2),
                                  )?.label ?? String(position.costCenter2)
                                : "—"}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionTitle>Tags</SectionTitle>
                {detail.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs font-medium text-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine Tags.</p>
                )}
              </section>

              <section>
                <SectionTitle>Interne Notizen</SectionTitle>
                <div className="mb-3 space-y-2 rounded-lg border border-border bg-card p-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Neue Notiz
                  </label>
                  <textarea
                    value={newNote}
                    onChange={(event) => setNewNote(event.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-ring/30"
                    placeholder="Interne Notiz hinzufügen"
                  />
                  {createNoteError ? (
                    <p className="text-xs text-destructive">{createNoteError}</p>
                  ) : null}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCreateNote}
                      disabled={creatingNote || newNote.trim().length === 0}
                      className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-semibold text-background transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {creatingNote ? (
                        <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
                      ) : null}
                      Notiz speichern
                    </button>
                  </div>
                </div>
                {detail.notes.length > 0 ? (
                  <ul className="space-y-2">
                    {detail.notes.map((note) => (
                      <li
                        key={note.id}
                        className="rounded-lg border border-border bg-card p-3 text-sm"
                      >
                        <p className="whitespace-pre-wrap text-foreground">
                          {note.content}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {note.writtenByName ?? "Unbekannt"}
                          {note.writtenAt
                            ? ` · ${formatDateTime(note.writtenAt)}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine Notizen.</p>
                )}
              </section>
            </div>
          ) : null}
        </div>

        {detail && editable ? (
          <footer className="flex items-center justify-between gap-3 border-t border-border bg-card/50 px-6 py-3">
            <p className="min-w-0 truncate text-xs text-destructive">{saveError ?? ""}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Schließen
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />
                ) : null}
                Speichern
              </button>
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
