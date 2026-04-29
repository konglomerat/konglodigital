import type { ComponentPropsWithoutRef } from "react";
import type { ReactNode } from "react";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";

import { FormField, FormSection, Textarea } from "./form";

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
  hint = "Wird intern am Beleg in Campai hinterlegt und ist nur für Admins sichtbar.",
  placeholder = "z. B. Genehmigt durch Vorstand am …",
  textareaProps,
  children,
}: InternalNoteSectionProps) {
  return (
    <FormSection title="Interne Notiz" icon={faPenToSquare}>
      {children}
      <FormField label={fieldLabel} hint={hint} error={error}>
        <Textarea rows={3} placeholder={placeholder} {...textareaProps} />
      </FormField>
    </FormSection>
  );
}