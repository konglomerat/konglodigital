"use client";

import { useRef } from "react";
import {
  faFolderOpen,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import Button from "@/components/knglmrt/Button";
import FieldShell from "@/components/knglmrt/FieldShell";
import FormSection from "@/components/knglmrt/FormSection";

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
      <FieldShell as="div" label="Belegdatei" required={required} hint={hint}>
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
                className="flex items-center justify-between gap-2 border border-border bg-card px-3 py-2 text-foreground"
              >
                <span className="truncate">
                  {files.length > 1 ? `${index + 1}. ` : ""}
                  {file.name}
                </span>
                <Button
                  kind="ghost"
                  size="chip"
                  iconOnly
                  icon={faXmark}
                  onClick={() => removeFile(index)}
                  className="shrink-0 text-muted-foreground"
                  aria-label="Datei entfernen"
                />
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
            {files.length === 0 ? "Datei auswählen" : "Weitere Datei auswählen"}
          </Button>
        </div>

        {files.length > 1 ? (
          <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
            {files.length} Dateien werden zu einer PDF zusammengefügt.
          </p>
        ) : null}
      </FieldShell>
    </FormSection>
  );
}
