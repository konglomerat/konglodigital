"use client";

import { useEffect, useState } from "react";

import { AutocompleteInput } from "@/app/[lang]/components/ui/autocomplete-input";
import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Field from "@/components/knglmrt/Field";
import FieldShell from "@/components/knglmrt/FieldShell";
import Notice from "@/components/knglmrt/Notice";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import Textarea from "@/components/knglmrt/Textarea";
import type { ReceiptFieldsPatch } from "@/lib/receipt-edit";

import ReceiptTagField, {
  invalidateReceiptTagSuggestions,
} from "../ReceiptTagField";

import {
  PAYMENT_STATUS_LABELS,
  TYPE_LABELS,
  formatDate,
  toDateInput,
  type ReceiptDetail,
} from "./normalize";
import { EditBlock, ReadGrid, ReadRow, SectionHeader, TextLink } from "./ui";
import type { PatchReceipt } from "./index";

type DetailsTabProps = {
  detail: ReceiptDetail;
  patchReceipt: PatchReceipt;
  saveTags: (tags: string[]) => Promise<void>;
  onDirtyChange: (key: string, dirty: boolean) => void;
  cancelable: boolean;
  onRequestCancel: () => void;
};

export const paymentStatusLabel = (detail: ReceiptDetail): string =>
  detail.canceledAt
    ? "storniert"
    : detail.paymentStatus
      ? (PAYMENT_STATUS_LABELS[detail.paymentStatus] ?? detail.paymentStatus)
      : "—";

export const paymentStatusTone = (detail: ReceiptDetail) =>
  detail.canceledAt
    ? ("neutral" as const)
    : detail.paymentStatus === "paid"
      ? ("gebucht" as const)
      : detail.paymentStatus === "partial"
        ? ("wartet" as const)
        : ("offen" as const);

const counterpartyLabel = (type: string | null) =>
  type === "expense" ? "Kreditor" : "Debitor";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Speichern fehlgeschlagen.";

export default function DetailsTab({
  detail,
  patchReceipt,
  saveTags,
  onDirtyChange,
  cancelable,
  onRequestCancel,
}: DetailsTabProps) {
  return (
    <div>
      {detail.canceledAt ? (
        <Notice tone="rosa" className="mt-3">
          Storniert am {formatDate(detail.canceledAt)}
          {detail.canceledReason ? ` · ${detail.canceledReason}` : ""}
        </Notice>
      ) : detail.isCashLinked ? (
        <Notice tone="grau" className="mt-3">
          Mit einer Kassenbuchung verknüpft — bitte direkt in Campai anpassen.
        </Notice>
      ) : detail.editable && !detail.fullyEditable ? (
        <Notice tone="grau" className="mt-3">
          Bereits (teil)bezahlt: nur Beschreibungen, Werkbereiche, Tags und
          Kommentare sind änderbar.
        </Notice>
      ) : null}

      <BelegSection
        detail={detail}
        patchReceipt={patchReceipt}
        onDirtyChange={onDirtyChange}
      />
      <TagsSection
        detail={detail}
        saveTags={saveTags}
        onDirtyChange={onDirtyChange}
      />
      <ZahlungSection
        detail={detail}
        patchReceipt={patchReceipt}
        onDirtyChange={onDirtyChange}
      />

      {cancelable ? (
        <div className="mt-4">
          <Button kind="tertiary" size="chip" onClick={onRequestCancel}>
            Beleg stornieren
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── Beleg ────────────────────────────────────────────────────────────────

type BelegDraft = {
  receiptNumber: string;
  account: number | null;
  accountName: string;
  description: string;
};

const belegDraftFrom = (detail: ReceiptDetail): BelegDraft => ({
  receiptNumber: detail.receiptNumber ?? "",
  account: detail.account,
  accountName: detail.accountName ?? "",
  description: detail.description,
});

function BelegSection({
  detail,
  patchReceipt,
  onDirtyChange,
}: Pick<DetailsTabProps, "detail" | "patchReceipt" | "onDirtyChange">) {
  const [draft, setDraft] = useState<BelegDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;
  const full = detail.fullyEditable;
  const label = counterpartyLabel(detail.type);

  useEffect(() => {
    onDirtyChange("beleg", editing);
  }, [editing, onDirtyChange]);

  const apply = async () => {
    if (!draft) return;
    const original = belegDraftFrom(detail);
    const fields: ReceiptFieldsPatch = {};
    if (draft.description !== original.description) {
      fields.description = draft.description;
    }
    if (full) {
      if (draft.receiptNumber.trim() !== original.receiptNumber) {
        fields.receiptNumber = draft.receiptNumber.trim();
      }
      if (draft.account !== original.account && draft.account !== null) {
        fields.account = draft.account;
        fields.accountName = draft.accountName;
      }
    }
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(fields).length > 0) {
        await patchReceipt({ receipt: fields });
      }
      setDraft(null);
    } catch (applyError) {
      setError(errorMessage(applyError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border-b-[0.5px] border-border pb-3 pt-3.5">
      <SectionHeader
        title="Beleg"
        action={
          detail.editable && !editing ? (
            <TextLink onClick={() => setDraft(belegDraftFrom(detail))}>
              Bearbeiten
            </TextLink>
          ) : null
        }
      />
      {draft ? (
        <EditBlock
          error={error}
          applying={saving}
          onCancel={() => {
            setDraft(null);
            setError(null);
          }}
          onApply={() => void apply()}
          applyDisabled={full && (!draft.receiptNumber.trim() || draft.account === null)}
        >
          <Field
            label="Belegnummer"
            kind="mono"
            value={draft.receiptNumber}
            disabled={!full}
            maxLength={64}
            onChange={(event) =>
              setDraft({ ...draft, receiptNumber: event.target.value })
            }
          />
          <Field
            label="Art"
            value={detail.type ? (TYPE_LABELS[detail.type] ?? detail.type) : "—"}
            disabled
            title="Die Art lässt sich nur durch Storno und Neuanlage ändern."
            onChange={() => undefined}
          />
          {full ? (
            <FieldShell
              as="div"
              label={label}
              className="col-span-2"
              hint={
                draft.account !== null
                  ? `Konto ${draft.account}`
                  : `Bitte einen ${label} auswählen.`
              }
            >
              <AutocompleteInput
                apiPath={
                  detail.type === "expense"
                    ? "/api/campai/creditors"
                    : "/api/campai/debtors"
                }
                entityLabelSingular={label}
                placeholder="Name oder Kontonummer eingeben…"
                value={draft.accountName}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    accountName: event.target.value,
                    account: null,
                  })
                }
                onSelect={(suggestion) =>
                  setDraft({
                    ...draft,
                    account: suggestion.account,
                    accountName: suggestion.name,
                  })
                }
              />
            </FieldShell>
          ) : (
            <Field
              label={label}
              className="col-span-2"
              value={detail.accountName ?? "—"}
              disabled
              onChange={() => undefined}
            />
          )}
          <Textarea
            label="Beschreibung"
            className="col-span-2"
            rows={2}
            maxLength={140}
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </EditBlock>
      ) : (
        <ReadGrid>
          <ReadRow label="Belegnummer" value={detail.receiptNumber} mono />
          <ReadRow
            label="Art"
            value={detail.type ? (TYPE_LABELS[detail.type] ?? detail.type) : null}
          />
          <ReadRow label={label} value={detail.accountName} />
          <ReadRow label="Beschreibung" value={detail.description} />
        </ReadGrid>
      )}
    </section>
  );
}

// ── Tags ─────────────────────────────────────────────────────────────────
// Eigener Abschnitt, damit Tags an jedem Beleg änderbar bleiben — auch an
// bezahlten, stornierten oder mit der Kasse verknüpften. Campai ersetzt die
// Liste vollständig.

const sameTags = (left: string[], right: string[]) =>
  left.length === right.length && left.every((tag, index) => tag === right[index]);

function TagsSection({
  detail,
  saveTags,
  onDirtyChange,
}: Pick<DetailsTabProps, "detail" | "saveTags" | "onDirtyChange">) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;

  useEffect(() => {
    onDirtyChange("tags", editing);
  }, [editing, onDirtyChange]);

  const apply = async () => {
    if (!draft) return;
    if (sameTags(draft, detail.tags)) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveTags(draft);
      invalidateReceiptTagSuggestions();
      setDraft(null);
    } catch (applyError) {
      setError(errorMessage(applyError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border-b-[0.5px] border-border pb-3 pt-3.5">
      <SectionHeader
        title="Tags"
        action={
          !editing ? (
            <TextLink onClick={() => setDraft(detail.tags)}>
              {detail.tags.length > 0 ? "Bearbeiten" : "+ Tag hinzufügen"}
            </TextLink>
          ) : null
        }
      />
      {draft ? (
        <EditBlock
          error={error}
          applying={saving}
          onCancel={() => {
            setDraft(null);
            setError(null);
          }}
          onApply={() => void apply()}
        >
          <ReceiptTagField
            className="col-span-2"
            value={draft}
            onChange={setDraft}
            hint="Vorhandene Tags aus Campai wählen oder neue tippen, Enter übernimmt."
          />
        </EditBlock>
      ) : detail.tags.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {detail.tags.map((tag) => (
            <li
              key={tag}
              className="bg-muted px-1.5 text-[length:var(--ui-size-field)] leading-[var(--ui-line-field)] text-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-muted-foreground">Keine Tags.</p>
      )}
    </section>
  );
}

// ── Termine & Zahlung ────────────────────────────────────────────────────

type ZahlungDraft = {
  receiptDate: string;
  dueDate: string;
  isNet: boolean;
};

const zahlungDraftFrom = (detail: ReceiptDetail): ZahlungDraft => ({
  receiptDate: toDateInput(detail.receiptDate),
  dueDate: toDateInput(detail.dueDate),
  isNet: detail.isNet,
});

function ZahlungSection({
  detail,
  patchReceipt,
  onDirtyChange,
}: Pick<DetailsTabProps, "detail" | "patchReceipt" | "onDirtyChange">) {
  const [draft, setDraft] = useState<ZahlungDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;

  useEffect(() => {
    onDirtyChange("zahlung", editing);
  }, [editing, onDirtyChange]);

  const apply = async () => {
    if (!draft) return;
    const original = zahlungDraftFrom(detail);
    const fields: ReceiptFieldsPatch = {};
    if (draft.receiptDate !== original.receiptDate) fields.receiptDate = draft.receiptDate;
    if (draft.dueDate !== original.dueDate) fields.dueDate = draft.dueDate;
    if (draft.isNet !== original.isNet) fields.isNet = draft.isNet;

    setSaving(true);
    setError(null);
    try {
      if (Object.keys(fields).length > 0) {
        await patchReceipt({ receipt: fields });
      }
      setDraft(null);
    } catch (applyError) {
      setError(errorMessage(applyError));
    } finally {
      setSaving(false);
    }
  };

  const gegenkonto =
    detail.account !== null ? String(detail.account) : null;

  return (
    <section className="border-b-[0.5px] border-border pb-3 pt-3.5">
      <SectionHeader
        title="Termine & Zahlung"
        action={
          detail.fullyEditable && !editing ? (
            <TextLink onClick={() => setDraft(zahlungDraftFrom(detail))}>
              Bearbeiten
            </TextLink>
          ) : null
        }
      />
      {draft ? (
        <EditBlock
          error={error}
          applying={saving}
          applyDisabled={!draft.receiptDate || !draft.dueDate}
          onCancel={() => {
            setDraft(null);
            setError(null);
          }}
          onApply={() => void apply()}
        >
          <Field
            label="Belegdatum"
            kind="mono"
            type="date"
            value={draft.receiptDate}
            onChange={(event) =>
              setDraft({ ...draft, receiptDate: event.target.value })
            }
          />
          <Field
            label="Fällig am"
            kind="mono"
            type="date"
            value={draft.dueDate}
            onChange={(event) =>
              setDraft({ ...draft, dueDate: event.target.value })
            }
          />
          <Field
            label="Status"
            value={paymentStatusLabel(detail)}
            disabled
            title="Den Status setzt Campai über die Zahlungen."
            onChange={() => undefined}
          />
          <Field
            label="Bezahlt am"
            kind="mono"
            value={formatDate(detail.paidAt)}
            disabled
            onChange={() => undefined}
          />
          <Field
            label="Gegenkonto"
            kind="mono"
            className="col-span-2"
            value={gegenkonto ?? "—"}
            disabled
            hint="Folgt dem Kreditor bzw. Debitor im Abschnitt Beleg."
            onChange={() => undefined}
          />
          <FieldShell as="div" label="Netto/Brutto" className="col-span-2">
            <SegmentedControl
              value={draft.isNet ? "net" : "gross"}
              options={[
                { value: "net", label: "Netto" },
                { value: "gross", label: "Brutto" },
              ]}
              onChange={(value) => setDraft({ ...draft, isNet: value === "net" })}
            />
          </FieldShell>
        </EditBlock>
      ) : (
        <ReadGrid>
          <ReadRow label="Belegdatum" value={formatDate(detail.receiptDate)} mono />
          <ReadRow label="Fällig am" value={formatDate(detail.dueDate)} mono />
          <ReadRow
            label="Status"
            value={
              <Badge tone={paymentStatusTone(detail)}>
                {paymentStatusLabel(detail)}
              </Badge>
            }
          />
          <ReadRow
            label="Bezahlt am"
            value={detail.paidAt ? formatDate(detail.paidAt) : null}
            mono
          />
          <ReadRow label="Gegenkonto" value={gegenkonto} mono />
          <ReadRow label="Netto/Brutto" value={detail.isNet ? "Netto" : "Brutto"} />
        </ReadGrid>
      )}
    </section>
  );
}
