"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import Button from "@/app/[lang]/components/Button";
import {
  Checkbox,
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "@/app/[lang]/components/ui/form";
import { getSupabaseRenderedImageUrl, isImageUrl } from "@/lib/resource-media";
import type {
  StoryDraftResult,
  StoryDraftSlide,
  StorySelectableItem,
} from "@/lib/story-drafts";
import type { StoryLayoutResult } from "@/lib/story-layout";

const FabricStorySlideEditor = dynamic(
  () => import("./FabricStorySlideEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-50 shadow-sm">
        <div className="flex aspect-[9/16] items-center justify-center bg-white text-sm text-zinc-500">
          Fabric-Editor wird geladen...
        </div>
      </div>
    ),
  },
);

type GenerateStoryClientProps = {
  locale: string;
  items: StorySelectableItem[];
};

type StoryDraftResponse = {
  error?: string;
  draft?: StoryDraftResult;
  warning?: string | null;
  usedFallback?: boolean;
};

type StoryLayoutResponse = {
  error?: string;
  layout?: StoryLayoutResult;
  warning?: string | null;
  usedFallback?: boolean;
};

type StoryRenderModel =
  | "gpt-4.1-mini"
  | "gemini-3-pro-image-preview"
  | "gemini-3.1-flash-image-preview";

type StoryGeneratedImage = {
  slideNumber: number;
  fileName: string;
  dataUrl: string;
  mimeType: string;
};

type StoryGeneratedImagesResponse = {
  error?: string;
  images?: StoryGeneratedImage[];
  warning?: string | null;
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

const getKindLabel = (item: StorySelectableItem) =>
  item.contentKind === "project"
    ? "Projekt"
    : item.resourceType?.trim() || "Ressource";

const renderPreviewImage = (item: StorySelectableItem) => {
  if (!item.image || !isImageUrl(item.image)) {
    return null;
  }

  return getSupabaseRenderedImageUrl(item.image, {
    width: 480,
    height: 480,
    resize: "cover",
  });
};

const DEFAULT_VISIBLE_ITEM_COUNT = 9;
const DEFAULT_LAYOUT_INSTRUCTIONS =
  "Erstelle und layoute eine Instagramstory, Kontext: Projekt des Monats. Sehr einfaches Layout, nicht hochtrabend, eher informativ. Die Story darf mehrseitig werden. Starte mit Seite 1. Die erste Seite soll vor allem das Ergebnis zeigen. Grosse Bilder. Verwende als Stil die Vorlage im letzten Bild. Den Text darfst du kuerzen und optimieren.";

const isGeneratedImageModel = (model: StoryRenderModel) =>
  model === "gemini-3-pro-image-preview" ||
  model === "gemini-3.1-flash-image-preview";

const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.click();
};

function SelectableGrid({
  items,
  selectedItemId,
  onSelect,
}: {
  items: StorySelectableItem[];
  selectedItemId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
        Keine Eintraege gefunden.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const imageUrl = renderPreviewImage(item);
        const isSelected = selectedItemId === item.id;
        const updatedAt = formatUpdatedAt(item.updatedAt);

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`overflow-hidden rounded-2xl border text-left transition ${
              isSelected
                ? "border-blue-600 bg-blue-50 shadow-sm"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
            }`}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="h-40 w-full object-cover" />
            ) : (
              <div className="flex h-40 w-full items-center justify-center bg-[linear-gradient(135deg,#f5efe7_0%,#e7dbc5_100%)] text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {getKindLabel(item)}
              </div>
            )}

            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-zinc-900">
                    {item.name}
                  </h3>
                  {item.prettyTitle ? (
                    <p className="text-xs text-zinc-500">/{item.prettyTitle}</p>
                  ) : null}
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                    isSelected
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {getKindLabel(item)}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-zinc-600">
                {stripText(item.description).slice(0, 140) ||
                  "Noch keine Beschreibung hinterlegt."}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                {updatedAt ? <span>Aktualisiert: {updatedAt}</span> : null}
                <span
                  className={`rounded-full px-2 py-1 font-semibold ${
                    item.socialMediaConsent
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {item.socialMediaConsent
                    ? "Social Media ok"
                    : "Keine Freigabe hinterlegt"}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function GenerateStoryClient({
  locale,
  items,
}: GenerateStoryClientProps) {
  const [basePrompt, setBasePrompt] = useState(
    "VORNAME hat mal wieder gewerkelt. INFOS ZUM PROJEKT. Schreibe witzig.",
  );
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "project" | "resource">("all");
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id ?? "");
  const [slideCount, setSlideCount] = useState<"1" | "2">("2");
  const [customInstructions, setCustomInstructions] = useState("");
  const [layoutInstructions, setLayoutInstructions] = useState(
    DEFAULT_LAYOUT_INSTRUCTIONS,
  );
  const [renderModel, setRenderModel] = useState<StoryRenderModel>(
    "gpt-4.1-mini",
  );
  const [showTextOverlay, setShowTextOverlay] = useState(true);
  const [draft, setDraft] = useState<StoryDraftResult | null>(null);
  const [layout, setLayout] = useState<StoryLayoutResult | null>(null);
  const [generatedImages, setGeneratedImages] = useState<StoryGeneratedImage[] | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutWarning, setLayoutWarning] = useState<string | null>(null);
  const [isGeneratingLayout, setIsGeneratingLayout] = useState(false);
  const [visibleItemCount, setVisibleItemCount] = useState(
    DEFAULT_VISIBLE_ITEM_COUNT,
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      if (kindFilter !== "all" && item.contentKind !== kindFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        item.name,
        item.prettyTitle,
        item.description,
        item.resourceType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [items, kindFilter, query]);

  useEffect(() => {
    setVisibleItemCount(DEFAULT_VISIBLE_ITEM_COUNT);
  }, [kindFilter, query]);

  const visibleItems = useMemo(() => {
    const selected = filteredItems.find((item) => item.id === selectedItemId) ?? null;
    const initialItems = filteredItems.slice(0, visibleItemCount);

    if (!selected || initialItems.some((item) => item.id === selected.id)) {
      return initialItems;
    }

    return [selected, ...initialItems.slice(0, Math.max(visibleItemCount - 1, 0))];
  }, [filteredItems, selectedItemId, visibleItemCount]);

  const deferredDraft = useDeferredValue(draft);

  const clearDraftMessages = () => {
    setDraft(null);
    setLayout(null);
    setGeneratedImages(null);
    setLayoutVersion(0);
    setSubmitError(null);
    setSubmitWarning(null);
    setLayoutError(null);
    setLayoutWarning(null);
  };

  const generateLayout = async (nextDraft: StoryDraftResult) => {
    setIsGeneratingLayout(true);
    setLayoutError(null);
    setLayoutWarning(null);
    setGeneratedImages(null);

    try {
      const response = await fetch("/api/admin/story-layout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: nextDraft.source.id,
          locale,
          slides: nextDraft.slides,
          layoutInstructions,
        }),
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as StoryLayoutResponse;

      if (!response.ok || !data.layout) {
        throw new Error(data.error ?? "Story-Layout konnte nicht erstellt werden.");
      }

      setLayout(data.layout);
      setLayoutVersion((current) => current + 1);
      setLayoutWarning(data.warning ?? null);
    } catch (error) {
      setLayoutError(
        error instanceof Error
          ? error.message
          : "Story-Layout konnte nicht erstellt werden.",
      );
    } finally {
      setIsGeneratingLayout(false);
    }
  };

  const generateImages = async (nextDraft: StoryDraftResult) => {
    setIsGeneratingLayout(true);
    setLayoutError(null);
    setLayoutWarning(null);
    setLayout(null);

    try {
      const response = await fetch("/api/admin/story-generated-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: nextDraft.source.id,
          locale,
          slides: nextDraft.slides,
          imageModel: renderModel,
          imageInstructions: layoutInstructions,
        }),
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as StoryGeneratedImagesResponse;

      if (!response.ok || !data.images?.length) {
        throw new Error(data.error ?? "Story-Bilder konnten nicht erstellt werden.");
      }

      setGeneratedImages(data.images);
      setLayoutWarning(data.warning ?? null);
    } catch (error) {
      setLayoutError(
        error instanceof Error
          ? error.message
          : "Story-Bilder konnten nicht erstellt werden.",
      );
    } finally {
      setIsGeneratingLayout(false);
    }
  };

  const updateSlide = (
    slideIndex: number,
    key: keyof StoryDraftSlide,
    value: string,
  ) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        slides: current.slides.map((slide, index) =>
          index === slideIndex ? { ...slide, [key]: value } : slide,
        ),
      };
    });
  };

  const handleGenerate = async () => {
    if (!selectedItemId) {
      setSubmitError("Waehle zuerst eine Ressource oder ein Projekt aus.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitWarning(null);

    try {
      const response = await fetch("/api/admin/story-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: selectedItemId,
          locale,
          slideCount: Number(slideCount),
          basePrompt,
          userInstructions: customInstructions,
        }),
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as StoryDraftResponse;

      if (!response.ok || !data.draft) {
        throw new Error(data.error ?? "Story-Entwurf konnte nicht erstellt werden.");
      }

      setDraft(data.draft);
      setSubmitWarning(data.warning ?? null);
      if (isGeneratedImageModel(renderModel)) {
        await generateImages(data.draft);
      } else {
        await generateLayout(data.draft);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Story-Entwurf konnte nicht erstellt werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Admin: Storys erzeugen
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-600">
          Waehle eine Ressource oder ein Projekt, lasse kurze Story-Texte per
          OpenAI vorschlagen und lade die gerenderten Story-Bilder direkt als
          PNG herunter.
        </p>
      </header>

      <FormSection
        title="Auswahl"
        description="Der Generator arbeitet mit beliebigen Ressourcen und Projekten aus der Plattform. Es wird immer nur ein Eintrag gleichzeitig verarbeitet."
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <FormField label="Suche">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nach Name, Beschreibung oder Typ filtern"
            />
          </FormField>
          <FormField label="Typ">
            <Select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as "all" | "project" | "resource")}
            >
              <option value="all">Alles</option>
              <option value="project">Projekte</option>
              <option value="resource">Ressourcen</option>
            </Select>
          </FormField>
        </div>

        <div className="mt-6">
          <SelectableGrid
            items={visibleItems}
            selectedItemId={selectedItemId}
            onSelect={(id) => {
              setSelectedItemId(id);
              clearDraftMessages();
            }}
          />

          {filteredItems.length > visibleItems.length ? (
            <div className="mt-4 flex items-center justify-center">
              <Button
                type="button"
                kind="secondary"
                size="small"
                onClick={() =>
                  setVisibleItemCount((current) => current + DEFAULT_VISIBLE_ITEM_COUNT)
                }
              >
                Mehr Eintraege anzeigen
              </Button>
            </div>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        title="Story-Setup"
        description="OpenAI erzeugt einen ersten Textentwurf. Danach kannst du jede Zeile anpassen und die Vorschau ohne neue Generierung aktualisiert sich automatisch."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField label="Ausgewaehlter Eintrag">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
              {selectedItem ? (
                <div className="space-y-1">
                  <p className="font-semibold text-zinc-900">{selectedItem.name}</p>
                  <p>
                    {getKindLabel(selectedItem)}
                    {selectedItem.socialMediaConsent
                      ? " - Social Media ok"
                      : " - Auch ohne Freigabe nutzbar"}
                  </p>
                </div>
              ) : (
                "Noch nichts ausgewaehlt."
              )}
            </div>
          </FormField>

          <FormField label="Anzahl Slides">
            <Select
              value={slideCount}
              onChange={(event) => {
                setSlideCount(event.target.value as "1" | "2");
                clearDraftMessages();
              }}
            >
              <option value="1">1 Slide</option>
              <option value="2">2 Slides</option>
            </Select>
          </FormField>

          <FormField
            label="Basisprompt"
            className="lg:col-span-2"
            hint="Platzhalter: VORNAME und INFOS ZUM PROJEKT werden automatisch ersetzt."
          >
            <Textarea
              value={basePrompt}
              onChange={(event) => setBasePrompt(event.target.value)}
              className="min-h-20"
              placeholder="VORNAME hat mal wieder gewerkelt. INFOS ZUM PROJEKT. Schreibe witzig."
            />
          </FormField>

          <FormField
            label="Zusatzanweisungen fuer OpenAI"
            className="lg:col-span-2"
            hint="Zum Beispiel: eher sachlich, eher werkstattnah, Fokus auf Material, ohne Call-to-Action."
          >
            <Textarea
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Optional: besonderer Ton, Fokus oder Formulierungshinweise"
            />
          </FormField>

          <FormField
            label="Bild- und Layout-Anweisungen"
            className="lg:col-span-2"
            hint="Fuer GPT steuert das die Layout-Generierung. Fuer die Gemini-Bildmodelle wird daraus der Prompt fuer das fertige Story-Bild gebaut. Seite 1 nutzt samplecover.png als Stilvorlage, Seite 2 nutzt makingof.png als Stilvorlage."
          >
            <Textarea
              value={layoutInstructions}
              onChange={(event) => setLayoutInstructions(event.target.value)}
              placeholder="Hinweise fuer Bildaufbau und Textplatzierung"
            />
          </FormField>

          <FormField label="Ausgabe-Modell">
            <Select
              value={renderModel}
              onChange={(event) => {
                setRenderModel(event.target.value as StoryRenderModel);
                clearDraftMessages();
              }}
            >
              <option value="gpt-4.1-mini">GPT + Fabric</option>
              <option value="gemini-3-pro-image-preview">Nanobanana Pro</option>
              <option value="gemini-3.1-flash-image-preview">Nanobanana 2</option>
            </Select>
          </FormField>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            kind="primary"
            size="medium"
            onClick={handleGenerate}
            disabled={!selectedItemId || isSubmitting}
          >
            {isSubmitting ? "Erzeugt..." : "Textentwurf erzeugen"}
          </Button>
          <Button
            type="button"
            kind="secondary"
            size="medium"
            onClick={() => {
              if (draft) {
                if (isGeneratedImageModel(renderModel)) {
                  void generateImages(draft);
                } else {
                  void generateLayout(draft);
                }
              }
            }}
            disabled={!draft || isGeneratingLayout}
          >
            {isGeneratingLayout
              ? isGeneratedImageModel(renderModel)
                ? "Bild wird erzeugt..."
                : "Layout erzeugt..."
              : isGeneratedImageModel(renderModel)
                ? "Bild neu erzeugen"
                : "Layout neu anordnen"}
          </Button>
          {!isGeneratedImageModel(renderModel) ? (
            <Checkbox
              label="Text auf dem Bild anzeigen"
              checked={showTextOverlay}
              onChange={(event) => setShowTextOverlay(event.target.checked)}
            />
          ) : null}
        </div>

        {submitError ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            {submitError}
          </div>
        ) : null}

        {submitWarning ? (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
            {submitWarning}
          </div>
        ) : null}

        {layoutError ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            {layoutError}
          </div>
        ) : null}

        {layoutWarning ? (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
            {layoutWarning}
          </div>
        ) : null}
      </FormSection>

      {draft ? (
        <>
          <FormSection
            title="Textentwurf"
            description="Die Vorschau rechts unten folgt deinen Aenderungen direkt. Wenn du komplett neu starten willst, erzeuge den Entwurf einfach erneut."
          >
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button href={draft.source.path} kind="secondary" size="small">
                  Eintrag oeffnen
                </Button>
                <span className="text-sm text-zinc-500">
                  {draft.source.name}
                </span>
              </div>

              {draft.slides.map((slide, index) => (
                <div
                  key={`${draft.source.id}-slide-${index}`}
                  className="grid gap-4 rounded-2xl border border-zinc-200 p-4"
                >
                  <h3 className="text-base font-semibold text-zinc-900">
                    Slide {index + 1}
                  </h3>
                  <FormField label="Kicker">
                    <Input
                      value={slide.kicker}
                      onChange={(event) =>
                        updateSlide(index, "kicker", event.target.value)
                      }
                    />
                  </FormField>
                  <FormField label="Headline">
                    <Textarea
                      value={slide.headline}
                      onChange={(event) =>
                        updateSlide(index, "headline", event.target.value)
                      }
                      className="min-h-20"
                    />
                  </FormField>
                  <FormField label="Body">
                    <Textarea
                      value={slide.body}
                      onChange={(event) =>
                        updateSlide(index, "body", event.target.value)
                      }
                    />
                  </FormField>
                </div>
              ))}
            </div>
          </FormSection>

          <FormSection
            title="Vorschau und Download"
            description={
              isGeneratedImageModel(renderModel)
                ? "Die Gemini-Bildmodelle erzeugen fertige Story-Slides als Bilder. Diese Vorschau ist nicht in Fabric editierbar und kann direkt heruntergeladen werden."
                : "Das Layout wird per GPT vorgeschlagen, in Fabric.js als editierbare Canvas aufgebaut und direkt aus dem Browser als PNG exportiert."
            }
          >
            {!isGeneratedImageModel(renderModel) ? (
              <div className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Textboxen koennen direkt im Canvas verschoben und skaliert werden. Texte lassen sich per Doppelklick im Fabric-Canvas bearbeiten. Fuer ein komplett neues Arrangement einfach "Layout neu anordnen" nutzen.
              </div>
            ) : (
              <div className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Nanobanana Pro und Nanobanana 2 erzeugen fertige Story-Bilder mit eingebranntem Layout. Zum Aktualisieren nach Textaenderungen einfach "Bild neu erzeugen" nutzen.
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {isGeneratedImageModel(renderModel) && generatedImages?.length
                ? generatedImages.map((image) => (
                    <div
                      key={image.fileName}
                      className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-50 shadow-sm"
                    >
                      <img
                        src={image.dataUrl}
                        alt={`Slide ${image.slideNumber}`}
                        className="block aspect-[9/16] w-full object-cover"
                      />
                      <div className="flex items-center justify-between gap-3 p-4">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">
                            Slide {image.slideNumber}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Generiertes Story-Bild
                          </p>
                        </div>
                        <Button
                          type="button"
                          kind="secondary"
                          size="small"
                          onClick={() =>
                            downloadDataUrl(image.dataUrl, image.fileName)
                          }
                        >
                          PNG herunterladen
                        </Button>
                      </div>
                    </div>
                  ))
                : !isGeneratedImageModel(renderModel) && deferredDraft && layout
                ? deferredDraft.slides.map((slide, index) => (
                    <FabricStorySlideEditor
                      key={`${deferredDraft.source.id}-${layoutVersion}-${index}`}
                      source={deferredDraft.source}
                      slideIndex={index}
                      slide={slide}
                      layout={layout.slides[index]}
                      layoutVersion={layoutVersion}
                      showTextOverlay={showTextOverlay}
                    />
                  ))
                : deferredDraft ? (
                    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 lg:col-span-2">
                      {isGeneratedImageModel(renderModel)
                        ? "Es liegen noch keine generierten Story-Bilder vor. Wenn gleichzeitig eine Warnung erscheint, ist die Bildgenerierung fehlgeschlagen."
                        : "Es liegt noch kein Layout fuer den Editor vor. Wenn gleichzeitig eine OpenAI-Warnung erscheint, ist der Generator auf den Standardpfad gefallen oder das Layout wurde nicht gesetzt."}
                    </div>
                  ) : null}
            </div>
          </FormSection>
        </>
      ) : null}
    </div>
  );
}