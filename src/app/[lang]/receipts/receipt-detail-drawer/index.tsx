"use client";

// Beleg-Sidebar (Design-Handoff „Variante 2a“, Issue #36).
// Kopf mit Offen · Fällig · Status, Tabs Details / Positionen / Datei, und
// darunter immer die Kommentare. Bearbeitet wird je Abschnitt; unbezahlte
// Belege sind voll änderbar, (teil)bezahlte nur bei Beschreibungen,
// Werkbereichen, Tags und Kommentaren.
import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";

import Badge from "@/components/knglmrt/Badge";
import Button from "@/components/knglmrt/Button";
import Dialog from "@/components/knglmrt/Dialog";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import Textarea from "@/components/knglmrt/Textarea";
import type { ReceiptPatchBody } from "@/lib/receipt-edit";

import CommentsPanel from "./CommentsPanel";
import DetailsTab, { paymentStatusLabel, paymentStatusTone } from "./DetailsTab";
import FileTab from "./FileTab";
import {
  TYPE_LABELS,
  formatCents,
  formatDate,
  normalizeReceipt,
  type CostCenterOption,
  type ReceiptDetail,
} from "./normalize";
import PositionsTab from "./PositionsTab";
import { CloseCross, sectionLabelClassName } from "./ui";

export type PatchReceipt = (
  body: ReceiptPatchBody & {
    receiptFile?: { base64: string; name: string; contentType: string };
  },
) => Promise<void>;

type ReceiptDetailDrawerProps = {
  receiptId: string | null;
  costCenterOptions: CostCenterOption[];
  onClose: () => void;
  onCostCentersChanged?: () => Promise<void> | void;
  onSaved?: (receiptId: string) => void;
};

type ReceiptOptions = {
  taxes: Array<{ code: string; rate: number }>;
};

// Steuersätze ändern sich praktisch nie — einmal pro Seitenaufruf genügt.
let optionsPromise: Promise<ReceiptOptions | null> | null = null;
const loadReceiptOptions = () => {
  optionsPromise ??= fetch("/api/campai/balance/receipts/options")
    .then((response) => (response.ok ? (response.json() as Promise<ReceiptOptions>) : null))
    .catch(() => null)
    .then((result) => {
      if (!result) optionsPromise = null;
      return result;
    });
  return optionsPromise;
};

const readJson = async (response: Response) =>
  (await response.json().catch(() => ({}))) as {
    receipt?: Record<string, unknown> | null;
    viewerName?: string;
    error?: string;
  };

export default function ReceiptDetailDrawer(props: ReceiptDetailDrawerProps) {
  if (props.receiptId === null) {
    return null;
  }
  // Neuer Beleg, neuer Zustand — der key setzt alle Entwürfe zurück.
  return <ReceiptPanel key={props.receiptId} {...props} receiptId={props.receiptId} />;
}

type Tab = "details" | "positionen" | "datei";

function ReceiptPanel({
  receiptId,
  costCenterOptions,
  onClose,
  onCostCentersChanged,
  onSaved,
}: ReceiptDetailDrawerProps & { receiptId: string }) {
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [viewerName, setViewerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [rateByCode, setRateByCode] = useState<Map<string, number> | null>(null);
  const [localCostCenters, setLocalCostCenters] = useState(costCenterOptions);
  const dirtyKeys = useRef(new Set<string>());

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => setLocalCostCenters(costCenterOptions), [costCenterOptions]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/campai/balance/receipts/${receiptId}`);
        const data = await readJson(response);
        if (!response.ok) throw new Error(data.error ?? `Fehler ${response.status}`);
        if (!active) return;
        if (data.receipt) setDetail(normalizeReceipt(data.receipt));
        setViewerName(data.viewerName ?? null);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Beleg konnte nicht geladen werden.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    void loadReceiptOptions().then((options) => {
      if (active && options) {
        setRateByCode(new Map(options.taxes.map((tax) => [tax.code, tax.rate])));
      }
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [receiptId]);

  const onDirtyChange = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyKeys.current.add(key);
    else dirtyKeys.current.delete(key);
  }, []);

  const requestClose = useCallback(() => {
    if (
      dirtyKeys.current.size > 0 &&
      !window.confirm("Es gibt nicht übernommene Änderungen. Trotzdem schließen?")
    ) {
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    // Solange der Storno-Dialog offen ist, schließt Escape nur den Dialog.
    if (cancelDialogOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [cancelDialogOpen, requestClose]);

  const applyResponse = useCallback(
    async (response: Response, fallback: string) => {
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? fallback);
      if (data.receipt) setDetail(normalizeReceipt(data.receipt));
      onSaved?.(receiptId);
    },
    [onSaved, receiptId],
  );

  const patchReceipt: PatchReceipt = useCallback(
    async (body) => {
      const response = await fetch(`/api/campai/balance/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await applyResponse(response, "Speichern fehlgeschlagen.");
    },
    [applyResponse, receiptId],
  );

  const saveTags = useCallback(
    async (tags: string[]) => {
      const response = await fetch(`/api/campai/balance/receipts/${receiptId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      await applyResponse(response, "Tags konnten nicht gespeichert werden.");
    },
    [applyResponse, receiptId],
  );

  const postComment = useCallback(
    async (content: string) => {
      const response = await fetch(`/api/campai/balance/receipts/${receiptId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "Kommentar konnte nicht gespeichert werden.");
      if (data.receipt) setDetail(normalizeReceipt(data.receipt));
    },
    [receiptId],
  );

  const handleCostCenterCreated = useCallback(
    (created: CostCenterOption, all: CostCenterOption[] | undefined) => {
      setLocalCostCenters((current) => all ?? [...current, created]);
      void Promise.resolve(onCostCentersChanged?.()).catch(() => undefined);
    },
    [onCostCentersChanged],
  );

  const handleCancelReceipt = async () => {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError("Bitte einen Grund angeben.");
      return;
    }
    setCanceling(true);
    setCancelError(null);
    try {
      const response = await fetch(`/api/campai/balance/receipts/${receiptId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error ?? "Storno fehlgeschlagen.");
      // Stornierte Belege tauchen in der Liste nicht mehr auf.
      setCancelDialogOpen(false);
      onSaved?.(receiptId);
      onClose();
    } catch (cancelErr) {
      setCancelError(cancelErr instanceof Error ? cancelErr.message : "Storno fehlgeschlagen.");
    } finally {
      setCanceling(false);
    }
  };

  const typeLabel = detail?.type ? (TYPE_LABELS[detail.type] ?? detail.type) : null;
  const kicker = detail
    ? detail.type === "invoice"
      ? "Rechnung · Einnahme"
      : `Beleg · ${typeLabel ?? "—"}`
    : "Beleg";
  const cancelable = Boolean(detail?.fullyEditable);

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Belegdetails">
      <button
        type="button"
        onClick={requestClose}
        className="flex-1 cursor-default bg-transparent"
        aria-label="Schließen"
        tabIndex={-1}
      />
      <aside
        className={`relative flex h-full w-full max-w-[560px] flex-col overflow-hidden knglmrt-border bg-card transition-opacity duration-200 ease-[cubic-bezier(.2,0,0,1)] ${entered ? "opacity-100" : "opacity-0"}`}
      >
        <header className="flex flex-none flex-col gap-3 px-6 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`${sectionLabelClassName} m-0 font-[family-name:var(--font-wide)] font-semibold text-primary`}>
                {kicker}
              </p>
              <h2 className="m-0 truncate font-[family-name:var(--font-display)] text-[length:var(--ui-size-lead)] font-black leading-[30px] text-foreground">
                {detail?.receiptNumber || "Beleg-Details"}
              </h2>
              {detail?.accountName ? (
                <p className="m-0 truncate text-muted-foreground" title={detail.accountName}>
                  {detail.accountName}
                </p>
              ) : null}
            </div>
            <CloseCross onClick={requestClose} />
          </div>

          {detail ? (
            <>
              <div className="grid grid-cols-3 divide-x-[0.5px] divide-border bg-primary-soft">
                <SummaryCell label="Offen">
                  <span className="font-[family-name:var(--font-num)] text-[18px] font-bold leading-6">
                    {formatCents(detail.totalAmountLeftToPay)}
                  </span>
                </SummaryCell>
                <SummaryCell label="Fällig">
                  <span className="knglmrt-num leading-6">{formatDate(detail.dueDate)}</span>
                </SummaryCell>
                <SummaryCell label="Status">
                  <Badge tone={paymentStatusTone(detail)}>{paymentStatusLabel(detail)}</Badge>
                </SummaryCell>
              </div>
              <SegmentedControl<Tab>
                value={tab}
                onChange={setTab}
                className="w-full"
                segmentClassName="flex-1"
                options={[
                  { value: "details", label: "Details" },
                  { value: "positionen", label: `Positionen (${detail.positions.length})` },
                  { value: "datei", label: "Datei" },
                ]}
              />
            </>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-1">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />
              Beleg wird geladen…
            </div>
          ) : error ? (
            <div className="mt-4 border border-destructive-border bg-destructive-soft px-4 py-3 text-destructive">
              {error}
            </div>
          ) : detail ? (
            // Alle Tabs bleiben gemountet, damit offene Entwürfe beim Wechseln
            // nicht verloren gehen.
            <>
              <div hidden={tab !== "details"}>
                <DetailsTab
                  detail={detail}
                  patchReceipt={patchReceipt}
                  saveTags={saveTags}
                  onDirtyChange={onDirtyChange}
                  cancelable={cancelable}
                  onRequestCancel={() => {
                    setCancelReason("");
                    setCancelError(null);
                    setCancelDialogOpen(true);
                  }}
                />
              </div>
              <div hidden={tab !== "positionen"}>
                <PositionsTab
                  detail={detail}
                  rateByCode={rateByCode}
                  costCenterOptions={localCostCenters}
                  onCostCenterCreated={handleCostCenterCreated}
                  patchReceipt={patchReceipt}
                  onDirtyChange={onDirtyChange}
                />
              </div>
              <div hidden={tab !== "datei"}>
                <FileTab
                  detail={detail}
                  active={tab === "datei"}
                  patchReceipt={patchReceipt}
                  onDirtyChange={onDirtyChange}
                />
              </div>
            </>
          ) : null}
        </div>

        {detail ? (
          <CommentsPanel notes={detail.notes} viewerName={viewerName} onPost={postComment} />
        ) : null}
      </aside>

      <Dialog
        open={cancelDialogOpen}
        title="Beleg stornieren?"
        tone="danger"
        width={460}
        onCancel={() => {
          if (!canceling) setCancelDialogOpen(false);
        }}
        actions={
          <>
            <Button kind="secondary" onClick={() => setCancelDialogOpen(false)} disabled={canceling}>
              Abbrechen
            </Button>
            <Button
              kind="danger-primary"
              onClick={() => void handleCancelReceipt()}
              disabled={cancelReason.trim().length === 0}
              loading={canceling}
            >
              Stornieren
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p>
            {detail?.receiptNumber ? `${detail.receiptNumber} wird` : "Der Beleg wird"} in Campai
            storniert und verschwindet aus der Übersicht. Das lässt sich nicht rückgängig machen.
          </p>
          <Textarea
            label="Grund"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={240}
            rows={2}
            placeholder="z. B. doppelt erfasst"
          />
          {cancelError ? <p className="text-destructive">{cancelError}</p> : null}
        </div>
      </Dialog>
    </div>
  );
}

function SummaryCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-2">
      <span className={`${sectionLabelClassName} text-muted-foreground`}>{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
