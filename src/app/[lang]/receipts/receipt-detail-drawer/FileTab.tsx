"use client";

import { useRef, useState } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import { buildReceiptFile } from "@/lib/merge-receipt-files";

import type { ReceiptDetail } from "./normalize";
import { EditActions } from "./ui";
import type { PatchReceipt } from "./index";

const bytesToBase64 = (bytes: Uint8Array) => {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export default function FileTab({
  detail,
  active,
  patchReceipt,
  onDirtyChange,
}: {
  detail: ReceiptDetail;
  /** Die Vorschau lädt erst, wenn der Tab zum ersten Mal offen ist. */
  active: boolean;
  patchReceipt: PatchReceipt;
  onDirtyChange: (key: string, dirty: boolean) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRequested, setPreviewRequested] = useState(active);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewVersion, setPreviewVersion] = useState(0);

  if (active && !previewRequested) setPreviewRequested(true);

  // Rechnungs-PDFs erzeugt Campai selbst, nur hochgeladene Belege sind tauschbar.
  const replaceable =
    detail.editable && (detail.type === "expense" || detail.type === "revenue");
  const hasFile = Boolean(detail.receiptFileName) || detail.type === "invoice";
  const downloadUrl = `/api/campai/balance/receipts/${detail.id}/download`;

  const setSelected = (next: File[]) => {
    setFiles(next);
    onDirtyChange("datei", next.length > 0);
  };

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      const file = await buildReceiptFile(files);
      if (!file) throw new Error("Datei konnte nicht gelesen werden.");
      await patchReceipt({
        receiptFile: {
          base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
          name: file.name,
          contentType: file.type || "application/octet-stream",
        },
      });
      setSelected([]);
      setPreviewVersion((version) => version + 1);
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Upload fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-3">
      <div className="h-[360px] bg-muted">
        {hasFile && previewRequested ? (
          <iframe
            key={previewVersion}
            src={`${downloadUrl}?inline=1&v=${previewVersion}`}
            title={detail.receiptFileName ?? "Belegdatei"}
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {hasFile ? "Vorschau wird geladen …" : "Keine Datei hinterlegt"}
          </div>
        )}
      </div>
      {detail.receiptFileName ? (
        <p
          className="m-0 mt-2 truncate knglmrt-num text-muted-foreground"
          title={detail.receiptFileName}
        >
          {detail.receiptFileName}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {hasFile ? (
          <Button kind="secondary" size="chip" href={downloadUrl}>
            Herunterladen
          </Button>
        ) : null}
        {replaceable ? (
          <Button
            kind="secondary"
            size="chip"
            onClick={() => inputRef.current?.click()}
          >
            {files.length === 0 ? "Datei ersetzen" : "Weitere Datei hinzufügen"}
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(event) => {
            const added = event.target.files ? Array.from(event.target.files) : [];
            if (added.length > 0) setSelected([...files, ...added]);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 ? (
        <div className="mt-3 bg-primary-soft p-3">
          <ul className="m-0 list-none space-y-1 p-0">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 bg-card px-3 py-1.5"
              >
                <span className="truncate">{file.name}</span>
                <Button
                  kind="ghost"
                  size="chip"
                  iconOnly
                  icon={faXmark}
                  aria-label="Datei entfernen"
                  onClick={() => setSelected(files.filter((_, i) => i !== index))}
                />
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-muted-foreground">
            {files.length > 1
              ? `${files.length} Dateien werden zu einer PDF zusammengefügt und ersetzen die bisherige Datei.`
              : "Ersetzt die bisherige Datei."}
          </p>
          {error ? <p className="mt-2 text-destructive">{error}</p> : null}
          <EditActions
            applying={saving}
            onCancel={() => {
              setSelected([]);
              setError(null);
            }}
            onApply={() => void apply()}
          />
        </div>
      ) : null}
    </div>
  );
}
