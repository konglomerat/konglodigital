"use client";

import { useState, type FormEvent } from "react";

import Button from "@/components/knglmrt/Button";
import Choice from "@/components/knglmrt/Choice";
import Field from "@/components/knglmrt/Field";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import Textarea from "@/components/knglmrt/Textarea";

type CmsFormField = {
  blockType?: string;
  defaultValue?: boolean | number | string | null;
  id?: string | null;
  label?: string | null;
  name?: string;
  options?: Array<{ label?: string; value?: string }> | null;
  placeholder?: string | null;
  required?: boolean | null;
  width?: number | null;
};

export type CmsForm = {
  confirmationType?: "message" | "redirect" | null;
  fields?: CmsFormField[] | null;
  id: string | number;
  redirect?: { url?: string | null } | null;
  submitButtonLabel?: string | null;
  title?: string;
};

export default function PayloadFormBlock({ form }: { form: CmsForm }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const values = new FormData(event.currentTarget);
    const submissionData = (form.fields ?? [])
      .filter((field) => field.name && field.blockType !== "message")
      .map((field) => ({
        field: field.name!,
        value:
          field.blockType === "checkbox"
            ? values.has(field.name!)
            : String(values.get(field.name!) ?? ""),
      }));

    try {
      const response = await fetch("/api/cms/form-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form: form.id, submissionData }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Das Formular konnte nicht gesendet werden.");
      }

      if (form.confirmationType === "redirect" && form.redirect?.url) {
        window.location.assign(form.redirect.url);
        return;
      }

      formElement.reset();
      setMessage("Danke, deine Angaben wurden übermittelt.");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Das Formular konnte nicht gesendet werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (message) {
    return (
      <div className="bg-success-soft px-5 py-4 font-bold" role="status">
        {message}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      {(form.fields ?? []).map((field, index) => {
        const key = field.id ?? field.name ?? `field-${index}`;
        const widthClassName =
          !field.width || field.width >= 100 ? "sm:col-span-2" : "";

        if (!field.name || field.blockType === "message") return null;

        if (field.blockType === "textarea") {
          return (
            <Textarea
              key={key}
              className={widthClassName}
              name={field.name}
              label={field.label ?? field.name}
              required={Boolean(field.required)}
              defaultValue={String(field.defaultValue ?? "")}
              rows={5}
            />
          );
        }

        if (field.blockType === "select") {
          return (
            <NativeSelect
              key={key}
              className={widthClassName}
              name={field.name}
              label={field.label ?? field.name}
              required={Boolean(field.required)}
              defaultValue={String(field.defaultValue ?? "")}
            >
              <option value="">Bitte auswählen</option>
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label ?? option.value}
                </option>
              ))}
            </NativeSelect>
          );
        }

        if (field.blockType === "checkbox") {
          return (
            <Choice
              key={key}
              className={widthClassName}
              name={field.name}
              label={field.label ?? field.name}
              required={Boolean(field.required)}
              defaultChecked={Boolean(field.defaultValue)}
            />
          );
        }

        return (
          <Field
            key={key}
            className={widthClassName}
            name={field.name}
            label={field.label ?? field.name}
            required={Boolean(field.required)}
            defaultValue={String(field.defaultValue ?? "")}
            placeholder={field.placeholder ?? undefined}
            type={
              field.blockType === "email"
                ? "email"
                : field.blockType === "number"
                  ? "number"
                  : "text"
            }
          />
        );
      })}

      {error ? (
        <p className="sm:col-span-2 text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <Button type="submit" kind="primary" loading={isSubmitting}>
          {form.submitButtonLabel ?? "Absenden"}
        </Button>
      </div>
    </form>
  );
}
