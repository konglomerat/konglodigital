import type { ComponentPropsWithoutRef } from "react";
import type { ReactNode } from "react";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";

import FormSection from "@/components/knglmrt/FormSection";
import Textarea from "@/components/knglmrt/Textarea";

type InternalNoteSectionProps = {
  error?: string;
  fieldLabel?: string;
  hint?: string;
  placeholder?: string;
  textareaProps?: ComponentPropsWithoutRef<"textarea">;
  children?: ReactNode;
};

export default function InternalNoteSection({
  error,
  fieldLabel = "Notiz",
  hint = "Wird in der Buchhaltung (Campai) als Kommentar hinterlegt und ist auch nur dort sichtbar",
  placeholder = "z. B. Genehmigt durch Vorstand am …",
  textareaProps,
  children,
}: InternalNoteSectionProps) {
  return (
    <FormSection title="Interne Notiz" icon={faPenToSquare}>
      {children}
      <Textarea
        label={fieldLabel}
        hint={hint}
        error={error}
        rows={3}
        placeholder={placeholder}
        {...textareaProps}
      />
    </FormSection>
  );
}
