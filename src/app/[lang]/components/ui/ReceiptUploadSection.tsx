"use client";

import { useRef } from "react";
import {
  faFolderOpen,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "../Button";
import { FormField, FormSection } from "./form";

type ReceiptUploadSectionProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  required?: boolean;
  accept?: string;
  hint?: string;
};

const DEFAULT_HINT =
  "Es können mehrere Belege hochgeladen werden. Diese werden dann zu einer Datei zusammengefügt und dem Beleg als Anhang mitgegeben. Mögliche Dateiformate: PDF, JPG, PNG";

export default function ReceiptUploadSection({
  files,
  onFilesChange,
  required = false,
  accept = ".pdf,.jpg,.jpeg,.png",
  hint = DEFAULT_HINT,
}: ReceiptUploadSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const added = event.target.files ? Array.from(event.target.files) : [];
    if (added.length > 0) {
      onFilesChange([...files, ...added]);
    }
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <FormSection title="Beleg hochladen" icon={faFolderOpen}>
      <FormField label="Belegdatei" required={required} hint={hint}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={handleAddFiles}
        />

        {files.length > 0 ? (
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              >
                <span className="truncate">
                  {files.length > 1 ? `${index + 1}. ` : ""}
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600"
                  aria-label="Datei entfernen"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-2">
          <Button
            type="button"
            kind="secondary"
            icon={faPlus}
            onClick={() => inputRef.current?.click()}
          >
            {files.length === 0
              ? "Datei auswählen"
              : "Weitere Datei auswählen"}
          </Button>
        </div>

        {files.length > 1 ? (
          <p className="mt-2 text-xs text-zinc-500">
            {files.length} Dateien werden zu einer PDF zusammengefügt.
          </p>
        ) : null}
      </FormField>
    </FormSection>
  );
}
