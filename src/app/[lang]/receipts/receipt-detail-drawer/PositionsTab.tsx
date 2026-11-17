"use client";

import { useEffect, useMemo, useState } from "react";

import ReactSelect from "@/app/[lang]/components/ui/react-select";
import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";
import Textarea from "@/components/knglmrt/Textarea";
import {
  centsToEuroInput,
  euroInputToCents,
  sanitizeEuroInput,
} from "@/lib/euro-input";
import {
  computeReceiptTotals,
  isValidCampaiCostCenter1,
  positionAmount,
  type PositionPatch,
} from "@/lib/receipt-edit";

import {
  formatCents,
  formatCentsPlain,
  type CostCenterOption,
  type ReceiptDetail,
  type ReceiptPositionDetail,
} from "./normalize";
import { EditActions, TextLink } from "./ui";
import type { PatchReceipt } from "./index";

const CREATE_COST_CENTER_OPTION: CostCenterOption = {
  value: "__create__",
  label: "Neu anlegen",
};

type PositionDraft = {
  key: string;
  description: string;
  costCenter1: string;
  costCenter2: number | null;
  amount: string;
  quantity: string;
  unit: string;
  unitAmount: string;
  // Nicht in der Sidebar editierbar, wird aber mitgeschickt.
  account: number | null;
  taxCode: string | null;
  discount: number | null;
  details: string | null;
};

let draftKeyCounter = 0;
const nextKey = () => `p${++draftKeyCounter}`;

const draftFromPosition = (position: ReceiptPositionDetail): PositionDraft => ({
  key: nextKey(),
  description: position.description,
  costCenter1: position.costCenter1 !== null ? String(position.costCenter1) : "",
  costCenter2: position.costCenter2,
  amount: centsToEuroInput(position.amount),
  quantity:
    position.quantity !== null ? String(position.quantity).replace(".", ",") : "",
  unit: position.unit ?? "",
  unitAmount: centsToEuroInput(position.unitAmount),
  account: position.account,
  taxCode: position.taxCode,
  discount: position.discount,
  details: position.details,
});

const parseQuantity = (value: string): number | null => {
  const parsed = Number.parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const toTotalsPosition = (draft: PositionDraft) => ({
  amount: euroInputToCents(draft.amount) ?? 0,
  quantity: parseQuantity(draft.quantity) ?? 0,
  unitAmount: euroInputToCents(draft.unitAmount) ?? 0,
  discount: draft.discount ?? 0,
  taxCode: draft.taxCode,
});

/** Fehlertext für eine Position, oder null wenn sie gespeichert werden kann. */
const validateDraft = (type: string | null, draft: PositionDraft): string | null => {
  if (type === "invoice") {
    const quantity = parseQuantity(draft.quantity);
    if (quantity === null || quantity <= 0) return "Menge fehlt.";
    if (euroInputToCents(draft.unitAmount) === null) return "Preis fehlt.";
  } else if (euroInputToCents(draft.amount) === null) {
    return "Betrag fehlt.";
  }
  if (draft.costCenter1.trim()) {
    const value = Number.parseInt(draft.costCenter1, 10);
    if (!Number.isInteger(value) || value <= 0 || !isValidCampaiCostCenter1(value)) {
      return "Sphäre muss mit 1, 2, 3, 4 oder 9 beginnen.";
    }
  }
  return null;
};

type PositionsTabProps = {
  detail: ReceiptDetail;
  rateByCode: ReadonlyMap<string, number> | null;
  costCenterOptions: CostCenterOption[];
  onCostCenterCreated: (
    created: CostCenterOption,
    all: CostCenterOption[] | undefined,
  ) => void;
  patchReceipt: PatchReceipt;
  onDirtyChange: (key: string, dirty: boolean) => void;
};

export default function PositionsTab({
  detail,
  rateByCode,
  costCenterOptions,
  onCostCenterCreated,
  patchReceipt,
  onDirtyChange,
}: PositionsTabProps) {
  const initial = useMemo(
    () => detail.positions.map(draftFromPosition),
    [detail.positions],
  );
  const [drafts, setDrafts] = useState<PositionDraft[]>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = detail.fullyEditable;
  const isInvoice = detail.type === "invoice";

  // Neu geladener Beleg (nach dem Speichern) setzt die Entwürfe zurück.
  useEffect(() => {
    setDrafts(initial);
    setExpanded(null);
  }, [initial]);

  const dirty = useMemo(() => {
    if (drafts.length !== initial.length) return true;
    const withoutKey = (draft: PositionDraft) =>
      JSON.stringify({ ...draft, key: undefined });
    return drafts.some(
      (draft, index) => withoutKey(draft) !== withoutKey(initial[index]),
    );
  }, [drafts, initial]);

  useEffect(() => {
    onDirtyChange("positionen", dirty);
  }, [dirty, onDirtyChange]);

  const costCenterLabel = (value: number | null) =>
    value === null
      ? null
      : (costCenterOptions.find((option) => option.value === String(value))
          ?.label ?? String(value));

  const update = (key: string, patch: Partial<PositionDraft>) =>
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );

  const addPosition = () => {
    const template = drafts[drafts.length - 1] ?? initial[0];
    const created: PositionDraft = {
      key: nextKey(),
      description: "",
      costCenter1: template?.costCenter1 ?? "",
      costCenter2: template?.costCenter2 ?? null,
      amount: "0,00",
      quantity: "1",
      unit: template?.unit ?? "",
      unitAmount: "0,00",
      account: template?.account ?? null,
      taxCode: template?.taxCode ?? null,
      discount: 0,
      details: "",
    };
    setDrafts((current) => [...current, created]);
    setExpanded(created.key);
  };

  const totals = useMemo(() => {
    const computed = computeReceiptTotals({
      type: detail.type,
      isNet: detail.isNet,
      positions: drafts.map(toTotalsPosition),
      rateByCode: rateByCode ?? new Map(),
    });
    // Ohne Änderungen gilt Campais eigene Summe (Rechnungsrabatte, Rundung).
    if (!dirty && detail.totalGrossAmount !== null && rateByCode) {
      const gross = detail.totalGrossAmount;
      return detail.isNet
        ? { net: computed.net, tax: gross - computed.net, gross }
        : { net: gross - computed.tax, tax: computed.tax, gross };
    }
    return computed;
  }, [detail, dirty, drafts, rateByCode]);

  const apply = async () => {
    for (const [index, draft] of drafts.entries()) {
      const problem = validateDraft(detail.type, draft);
      if (problem) {
        setError(`Position ${index + 1}: ${problem}`);
        setExpanded(draft.key);
        return;
      }
    }

    const positions: PositionPatch[] = drafts.map((draft) =>
      full
        ? {
            description: draft.description,
            costCenter1: draft.costCenter1.trim()
              ? Number.parseInt(draft.costCenter1, 10)
              : null,
            costCenter2: draft.costCenter2,
            account: draft.account,
            taxCode: draft.taxCode,
            ...(isInvoice
              ? {
                  quantity: parseQuantity(draft.quantity),
                  unit: draft.unit,
                  unitAmount: euroInputToCents(draft.unitAmount),
                  discount: draft.discount,
                  details: draft.details,
                }
              : { amount: euroInputToCents(draft.amount) }),
          }
        : { description: draft.description, costCenter2: draft.costCenter2 },
    );

    setSaving(true);
    setError(null);
    try {
      await patchReceipt({ positions });
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Speichern fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-1">
      <ul className="m-0 list-none p-0">
        {drafts.map((draft, index) => {
          const open = expanded === draft.key;
          const amount = positionAmount(detail.type, toTotalsPosition(draft));
          const werkbereich = costCenterLabel(draft.costCenter2);
          const meta = [
            isInvoice
              ? `${draft.quantity || "0"} ${draft.unit} × ${draft.unitAmount || "0,00"} €`.replace(/\s+/g, " ")
              : null,
            werkbereich,
            draft.costCenter1 ? `Sphäre ${draft.costCenter1}` : null,
          ]
            .filter(Boolean)
            .join(" · ");

          if (open) {
            return (
              <li key={draft.key} className="mb-2.5 mt-1 bg-muted p-3">
                <PositionEditor
                  draft={draft}
                  index={index}
                  isInvoice={isInvoice}
                  full={full}
                  canRemove={full && drafts.length > 1}
                  costCenterOptions={costCenterOptions}
                  onCostCenterCreated={onCostCenterCreated}
                  onChange={(patch) => update(draft.key, patch)}
                  onRemove={() => {
                    setDrafts((current) => current.filter((entry) => entry.key !== draft.key));
                    setExpanded(null);
                  }}
                  onDone={() => setExpanded(null)}
                />
              </li>
            );
          }

          return (
            <li key={draft.key} className="border-b-[0.5px] border-border">
              <button
                type="button"
                onClick={() => {
                  setExpanded(draft.key);
                  setError(null);
                }}
                className="grid w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-baseline gap-2.5 px-0 py-2.5 text-left hover:bg-[var(--knglmrt-tint-zebra)] dark:hover:bg-muted"
              >
                <span className="knglmrt-num text-muted-foreground">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-bold text-foreground">
                    {draft.description || "Ohne Beschreibung"}
                  </span>
                  {meta ? (
                    <span className="mt-0.5 block truncate knglmrt-num text-muted-foreground">
                      {meta}
                    </span>
                  ) : null}
                </span>
                <span className="knglmrt-num font-bold text-foreground">
                  {formatCents(amount)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        {full ? (
          <TextLink onClick={addPosition}>+ Position hinzufügen</TextLink>
        ) : (
          <span />
        )}
        <span className="knglmrt-num text-muted-foreground">
          netto {formatCentsPlain(totals.net)}
          {rateByCode ? ` · USt ${formatCentsPlain(totals.tax)}` : ""} ·{" "}
          <strong className="text-foreground">
            brutto {formatCents(totals.gross)}
          </strong>
        </span>
      </div>

      {error ? <p className="mt-3 text-destructive">{error}</p> : null}

      {dirty ? (
        <div className="mt-3 bg-primary-soft px-3 pb-3 pt-2">
          <p className="m-0 text-foreground">
            Positionen geändert — erst mit „Übernehmen“ gespeichert.
          </p>
          <EditActions
            applying={saving}
            onCancel={() => {
              setDrafts(initial);
              setExpanded(null);
              setError(null);
            }}
            onApply={() => void apply()}
          />
        </div>
      ) : null}
    </div>
  );
}

function PositionEditor({
  draft,
  index,
  isInvoice,
  full,
  canRemove,
  costCenterOptions,
  onCostCenterCreated,
  onChange,
  onRemove,
  onDone,
}: {
  draft: PositionDraft;
  index: number;
  isInvoice: boolean;
  full: boolean;
  canRemove: boolean;
  costCenterOptions: CostCenterOption[];
  onCostCenterCreated: PositionsTabProps["onCostCenterCreated"];
  onChange: (patch: Partial<PositionDraft>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const columns = isInvoice
    ? "grid-cols-[72px_72px_96px_minmax(0,1fr)_64px]"
    : "grid-cols-[112px_minmax(0,1fr)_64px]";

  const selectOptions = useMemo(
    () => [...costCenterOptions, CREATE_COST_CENTER_OPTION],
    [costCenterOptions],
  );
  const selected =
    draft.costCenter2 !== null
      ? (costCenterOptions.find((option) => option.value === String(draft.costCenter2)) ?? {
          value: String(draft.costCenter2),
          label: String(draft.costCenter2),
        })
      : null;

  return (
    <div>
      <p className="m-0 mb-2 knglmrt-num text-muted-foreground">Position {index + 1}</p>
      <div className={`grid ${columns} items-end gap-2`}>
        <Textarea
          label="Beschreibung"
          className="col-span-full"
          rows={2}
          maxLength={200}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        {isInvoice ? (
          <>
            <Field
              label="Menge"
              kind="mono"
              inputMode="decimal"
              disabled={!full}
              value={draft.quantity}
              onChange={(event) =>
                onChange({ quantity: event.target.value.replace(/[^\d,.]/g, "") })
              }
            />
            <Field
              label="Einheit"
              disabled={!full}
              maxLength={20}
              value={draft.unit}
              onChange={(event) => onChange({ unit: event.target.value })}
            />
            <Field
              label="Preis €"
              kind="mono"
              inputMode="decimal"
              disabled={!full}
              value={draft.unitAmount}
              onChange={(event) =>
                onChange({ unitAmount: sanitizeEuroInput(event.target.value) })
              }
            />
          </>
        ) : (
          <Field
            label="Betrag €"
            kind="mono"
            inputMode="decimal"
            disabled={!full}
            value={draft.amount}
            onChange={(event) => onChange({ amount: sanitizeEuroInput(event.target.value) })}
          />
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="knglmrt-label text-foreground">Werkbereich</span>
          <ReactSelect<CostCenterOption>
            isClearable
            options={selectOptions}
            value={selected}
            menuPlacement="auto"
            onChange={(value) => {
              if (value?.value === CREATE_COST_CENTER_OPTION.value) {
                setCreating(true);
                return;
              }
              const next = value ? Number.parseInt(value.value, 10) : null;
              onChange({ costCenter2: next !== null && Number.isFinite(next) ? next : null });
              setCreating(false);
            }}
            formatOptionLabel={(option, meta) =>
              meta.context === "value" ? (
                <span title={`${option.value} ${option.label}`}>{option.label}</span>
              ) : option.value === CREATE_COST_CENTER_OPTION.value ? (
                <span className="font-bold text-foreground">{option.label}</span>
              ) : (
                <span className="inline-flex items-baseline gap-2">
                  <span className="knglmrt-num text-muted-foreground">{option.value}</span>
                  <span>{option.label}</span>
                </span>
              )
            }
            placeholder="Auswählen…"
            noOptionsMessage={() => "Keine Werkbereiche gefunden."}
          />
        </div>
        <Field
          label="Sphäre"
          kind="mono"
          inputMode="numeric"
          disabled={!full}
          maxLength={8}
          value={draft.costCenter1}
          onChange={(event) =>
            onChange({ costCenter1: event.target.value.replace(/\D/g, "") })
          }
        />
      </div>

      {creating ? (
        <CreateCostCenter
          onCancel={() => setCreating(false)}
          onCreated={(created, all) => {
            onCostCenterCreated(created, all);
            onChange({ costCenter2: Number.parseInt(created.value, 10) });
            setCreating(false);
          }}
        />
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        {canRemove ? (
          <TextLink onClick={onRemove}>Position entfernen</TextLink>
        ) : (
          <span />
        )}
        <Button kind="primary" size="chip" onClick={onDone}>
          Fertig
        </Button>
      </div>
    </div>
  );
}

function CreateCostCenter({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (created: CostCenterOption, all: CostCenterOption[] | undefined) => void;
}) {
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const parsedNumber = Number.parseInt(number.trim(), 10);
    if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
      setError("Bitte eine gültige Werkbereich-Nummer eingeben.");
      return;
    }
    if (!label.trim()) {
      setError("Bitte einen Namen für den Werkbereich eingeben.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/campai/cost-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: parsedNumber, label: label.trim(), bookable: true }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        costCenter?: CostCenterOption;
        costCenters?: CostCenterOption[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Werkbereich konnte nicht angelegt werden.");
      }
      onCreated(
        data.costCenter ?? { value: String(parsedNumber), label: label.trim() },
        data.costCenters,
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Werkbereich konnte nicht angelegt werden.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 bg-card p-3 knglmrt-border">
      <p className="m-0 mb-2 knglmrt-label text-foreground">Neuen Werkbereich anlegen</p>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
        <Field
          kind="mono"
          inputMode="numeric"
          placeholder="Nummer"
          aria-label="Nummer"
          value={number}
          onChange={(event) => setNumber(event.target.value.replace(/\D/g, ""))}
        />
        <Field
          placeholder="Name"
          aria-label="Name"
          maxLength={32}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      {error ? <p className="mt-2 text-destructive">{error}</p> : null}
      <EditActions
        onCancel={onCancel}
        onApply={() => void submit()}
        applying={saving}
        applyLabel="Anlegen"
      />
    </div>
  );
}
