"use client";

import { useMemo, useState } from "react";

import Button from "@/app/[lang]/components/Button";
import { FormField, FormSection, Input, Select } from "@/app/[lang]/components/ui/form";
import { getSupabaseRenderedImageUrl, isImageUrl } from "@/lib/resource-media";

type SelectableItem = {
  id: string;
  name: string;
  prettyTitle: string | null;
  description: string | null;
  image: string | null;
  updatedAt: string | null;
};

type RecipientList = {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
};

type Defaults = {
  fromName: string;
  fromEmail: string;
  subject: string;
  recipientListId: number | null;
};

type GenerateNewsletterClientProps = {
  locale: string;
  resources: SelectableItem[];
  projects: SelectableItem[];
  recipientLists: RecipientList[];
  defaults: Defaults;
  rapidmailError: string | null;
};

type CreateDraftResponse = {
  error?: string;
  mailing?: {
    id: number | null;
    status: string | null;
    subject: string | null;
    url: string | null;
  };
  counts?: {
    resources: number;
    projects: number;
  };
};

const stripText = (value: string | null) =>
  value?.replace(/\s+/g, " ").trim() ?? "";

const formatUpdatedAt = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const filterItems = (items: SelectableItem[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [item.name, item.prettyTitle, item.description]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
};

const renderPreviewImage = (item: SelectableItem) => {
  if (!item.image || !isImageUrl(item.image)) {
    return null;
  }

  return getSupabaseRenderedImageUrl(item.image, {
    width: 480,
    resize: "cover",
  });
};

function SelectableGrid({
  title,
  emptyLabel,
  items,
  selectedIds,
  onToggle,
}: {
  title: string;
  emptyLabel: string;
  items: SelectableItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {selectedIds.size} ausgewaehlt
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const imageUrl = renderPreviewImage(item);
            const isSelected = selectedIds.has(item.id);
            const updatedAt = formatUpdatedAt(item.updatedAt);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className={`overflow-hidden rounded-2xl border text-left transition ${
                  isSelected
                    ? "border-blue-600 bg-blue-50 shadow-sm"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                }`}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-40 w-full items-center justify-center bg-[linear-gradient(135deg,#eff6ff_0%,#fef3c7_100%)] text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {title}
                  </div>
                )}

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-zinc-900">
                        {item.name}
                      </h4>
                      {item.prettyTitle ? (
                        <p className="text-xs text-zinc-500">/{item.prettyTitle}</p>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold ${
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {isSelected ? "Ja" : "Nein"}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-zinc-600">
                    {stripText(item.description).slice(0, 140) ||
                      "Noch keine Beschreibung hinterlegt."}
                  </p>

                  {updatedAt ? (
                    <p className="text-xs font-medium text-zinc-500">
                      Aktualisiert: {updatedAt}
                    </p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GenerateNewsletterClient({
  locale,
  resources,
  projects,
  recipientLists,
  defaults,
  rapidmailError,
}: GenerateNewsletterClientProps) {
  const [fromName, setFromName] = useState(defaults.fromName);
  const [fromEmail, setFromEmail] = useState(defaults.fromEmail);
  const [subject, setSubject] = useState(defaults.subject);
  const [recipientListId, setRecipientListId] = useState(
    defaults.recipientListId ? String(defaults.recipientListId) : "",
  );
  const [resourceQuery, setResourceQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [createdDraftUrl, setCreatedDraftUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredResources = useMemo(
    () => filterItems(resources, resourceQuery),
    [resources, resourceQuery],
  );
  const filteredProjects = useMemo(
    () => filterItems(projects, projectQuery),
    [projects, projectQuery],
  );

  const selectedCount = selectedResourceIds.size + selectedProjectIds.size;
  const canSubmit =
    !isSubmitting &&
    !rapidmailError &&
    Boolean(fromName.trim()) &&
    Boolean(fromEmail.trim()) &&
    Boolean(subject.trim()) &&
    Boolean(recipientListId) &&
    selectedCount > 0;

  const toggleSelection = (
    current: Set<string>,
    update: (next: Set<string>) => void,
    id: string,
  ) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    update(next);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    setCreatedDraftUrl(null);

    try {
      const response = await fetch("/api/admin/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          locale,
          fromName,
          fromEmail,
          subject,
          recipientListId: Number(recipientListId),
          resourceIds: Array.from(selectedResourceIds),
          projectIds: Array.from(selectedProjectIds),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as CreateDraftResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Newsletter-Entwurf konnte nicht erstellt werden.");
      }

      setSubmitSuccess(
        `Rapidmail-Entwurf erstellt mit ${data.counts?.resources ?? 0} Ressourcen und ${data.counts?.projects ?? 0} Projekten.`,
      );
      setCreatedDraftUrl(data.mailing?.url ?? null);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Newsletter-Entwurf konnte nicht erstellt werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Admin: Newsletter erzeugen
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-600">
          Waehle mehrere Ressourcen und Projekte aus und lege daraus einen neuen
          Rapidmail-Entwurf an. Gesendet wird hier nichts, es wird nur ein Draft
          in Rapidmail angelegt.
        </p>
      </header>

      <FormSection
        title="Rapidmail"
        description="Rapidmail benoetigt Absenderdaten, einen Betreff und eine Empfaengerliste. Die Felder sind mit den zuletzt gefundenen Werten vorbelegt, wenn Rapidmail erreichbar war."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Absendername" required>
            <Input value={fromName} onChange={(event) => setFromName(event.target.value)} />
          </FormField>
          <FormField label="Absender-E-Mail" required>
            <Input
              type="email"
              value={fromEmail}
              onChange={(event) => setFromEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Betreff" required className="md:col-span-2">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </FormField>
          <FormField label="Empfaengerliste" required className="md:col-span-2">
            <Select
              value={recipientListId}
              onChange={(event) => setRecipientListId(event.target.value)}
              disabled={recipientLists.length === 0}
            >
              <option value="">Empfaengerliste waehlen</option>
              {recipientLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        {rapidmailError ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            {rapidmailError}
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title="Inhalte"
        description="Die Auswahl wird als einfache Newsletter-Zusammenstellung mit direkten Links auf die Plattform erzeugt."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField label="Ressourcen durchsuchen">
            <Input
              value={resourceQuery}
              onChange={(event) => setResourceQuery(event.target.value)}
              placeholder="Nach Name oder Beschreibung filtern"
            />
          </FormField>
          <FormField label="Projekte durchsuchen">
            <Input
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
              placeholder="Nach Name oder Beschreibung filtern"
            />
          </FormField>
        </div>

        <div className="mt-6 space-y-8">
          <SelectableGrid
            title="Ressourcen"
            emptyLabel="Keine Ressourcen gefunden."
            items={filteredResources}
            selectedIds={selectedResourceIds}
            onToggle={(id) =>
              toggleSelection(selectedResourceIds, setSelectedResourceIds, id)
            }
          />

          <SelectableGrid
            title="Projekte"
            emptyLabel="Keine Projekte gefunden."
            items={filteredProjects}
            selectedIds={selectedProjectIds}
            onToggle={(id) =>
              toggleSelection(selectedProjectIds, setSelectedProjectIds, id)
            }
          />
        </div>
      </FormSection>

      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-zinc-900">Entwurf anlegen</h2>
            <p className="text-sm text-zinc-600">
              Ausgewaehlt: {selectedResourceIds.size} Ressourcen, {selectedProjectIds.size} Projekte.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              kind="secondary"
              className="px-4 py-2 text-sm"
              onClick={() => {
                setSelectedResourceIds(new Set());
                setSelectedProjectIds(new Set());
              }}
              disabled={selectedCount === 0 || isSubmitting}
            >
              Auswahl leeren
            </Button>
            <Button
              type="button"
              kind="primary"
              className="px-4 py-2 text-sm"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={!canSubmit}
            >
              {isSubmitting ? "Erzeuge Entwurf ..." : "Rapidmail-Entwurf anlegen"}
            </Button>
          </div>
        </div>

        {submitError ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            {submitError}
          </div>
        ) : null}

        {submitSuccess ? (
          <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
            <p>{submitSuccess}</p>
            {createdDraftUrl ? (
              <p className="mt-2">
                <a
                  href={createdDraftUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-emerald-800 underline underline-offset-2"
                >
                  Entwurf in Rapidmail oeffnen
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}