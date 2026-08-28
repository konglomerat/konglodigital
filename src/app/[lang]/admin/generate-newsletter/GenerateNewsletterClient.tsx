"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  faArrowDown,
  faArrowUp,
  faBullhorn,
  faDesktop,
  faDownload,
  faGripVertical,
  faLink,
  faMobileScreen,
  faPaperPlane,
  faPlus,
  faRotate,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "@/components/knglmrt/Button";
import { SegmentedControl } from "@/components/knglmrt/SegmentedControl";
import SubPageTitle from "@/app/[lang]/admin/SubPageTitle";
import Choice from "@/components/knglmrt/Choice";
import Field from "@/components/knglmrt/Field";
import FormSection from "@/components/knglmrt/FormSection";
import NativeSelect from "@/components/knglmrt/NativeSelect";
import Textarea from "@/components/knglmrt/Textarea";
import { getSupabaseRenderedImageUrl } from "@/lib/resource-media";

type NewsletterShowcase = {
  id: string;
  name: string;
  prettyTitle: string | null;
  description: string | null;
  images: string[];
  publishDate: string | null;
  updatedAt: string | null;
  href: string;
};

type RecipientList = {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
};

type AspectRatio = "original" | "1:1" | "4:3" | "3:2" | "16:9" | "4:5" | "3:4";

type ShowcaseOptions = {
  layout: "split" | "stacked";
  aspect: AspectRatio;
  imageUrl: string | null;
  showLink: boolean;
  linkText: string;
};

type ShowcaseItem = {
  id: string;
  type: "showcase";
  showcaseId: string;
  options: ShowcaseOptions;
};

type ButtonItem = {
  id: string;
  type: "button";
  title: string;
  href: string;
};

type BannerItem = {
  id: string;
  type: "banner";
  title: string;
  content: string;
};

type BuilderItem = ShowcaseItem | ButtonItem | BannerItem;

type GenerateNewsletterClientProps = {
  locale: string;
  showcases: NewsletterShowcase[];
  recipientLists: RecipientList[];
  issueDefaults: {
    title: string;
    subject: string;
    intro: string;
  };
  rapidmailDefaults: {
    fromName: string;
    fromEmail: string;
    recipientListId: number | null;
  };
  rapidmailError: string | null;
};

type DraftResponse = {
  error?: string;
  mailing?: {
    id: number | null;
    status: string | null;
    subject: string | null;
  };
  counts?: { showcases: number };
};

type StoredConfig = {
  version: 1;
  title: string;
  subject: string;
  intro: string;
  showShowcasesHeading: boolean;
  items: BuilderItem[];
  previewViewport: "desktop" | "mobile";
};

const STORAGE_KEY = "konglodigital.newsletter.config.v1";
const MAX_SELECTED_SHOWCASES = 24;
const ASPECT_RATIOS: AspectRatio[] = [
  "original",
  "1:1",
  "4:3",
  "3:2",
  "16:9",
  "4:5",
  "3:4",
];

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const formatDate = (value: string | null) => {
  if (!value) return "Ohne Datum";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Ohne Datum";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(parsed);
};

const stripText = (value: string | null) =>
  (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[>#*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const previewImage = (value: string | null, width = 320, height = 200) =>
  value
    ? getSupabaseRenderedImageUrl(value, {
        width,
        height,
        resize: "cover",
      })
    : null;

const createShowcaseItem = (showcase: NewsletterShowcase): ShowcaseItem => ({
  id: `showcase:${showcase.id}`,
  type: "showcase",
  showcaseId: showcase.id,
  options: {
    layout: "split",
    aspect: "original",
    imageUrl: showcase.images[0] ?? null,
    showLink: true,
    linkText: "Weiterlesen",
  },
});

const createCustomId = (type: "button" | "banner") =>
  `${type}:${window.crypto.randomUUID()}`;

const errorMessageFromResponse = (raw: string, fallback: string) => {
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error ?? fallback;
  } catch {
    return raw.trim() || fallback;
  }
};

const restoreItems = (
  value: unknown,
  showcaseMap: Map<string, NewsletterShowcase>,
): BuilderItem[] => {
  if (!Array.isArray(value)) return [];

  const usedShowcaseIds = new Set<string>();
  const usedItemIds = new Set<string>();
  const restored: BuilderItem[] = [];

  for (const candidate of value.slice(0, 200)) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Partial<BuilderItem> & {
      options?: Partial<ShowcaseOptions>;
    };

    // Ältere Entwürfe aus dem localStorage nutzen noch "project"/"projectId".
    const legacy = candidate as {
      type?: unknown;
      showcaseId?: unknown;
      projectId?: unknown;
    };
    const rawShowcaseId =
      typeof legacy.showcaseId === "string"
        ? legacy.showcaseId
        : typeof legacy.projectId === "string"
          ? legacy.projectId
          : null;

    if (
      (raw.type === "showcase" || legacy.type === "project") &&
      rawShowcaseId
    ) {
      const showcase = showcaseMap.get(rawShowcaseId);
      if (
        !showcase ||
        usedShowcaseIds.has(showcase.id) ||
        usedShowcaseIds.size >= MAX_SELECTED_SHOWCASES
      ) {
        continue;
      }
      const requestedImage = raw.options?.imageUrl;
      const imageUrl =
        typeof requestedImage === "string" &&
        showcase.images.includes(requestedImage)
          ? requestedImage
          : (showcase.images[0] ?? null);
      const aspect = ASPECT_RATIOS.includes(raw.options?.aspect as AspectRatio)
        ? (raw.options?.aspect as AspectRatio)
        : "original";

      restored.push({
        id: `showcase:${showcase.id}`,
        type: "showcase",
        showcaseId: showcase.id,
        options: {
          layout: raw.options?.layout === "stacked" ? "stacked" : "split",
          aspect,
          imageUrl,
          showLink: raw.options?.showLink !== false,
          linkText:
            typeof raw.options?.linkText === "string" &&
            raw.options.linkText.trim()
              ? raw.options.linkText.trim().slice(0, 80)
              : "Weiterlesen",
        },
      });
      usedShowcaseIds.add(showcase.id);
      continue;
    }

    if (
      raw.type === "button" &&
      typeof raw.id === "string" &&
      raw.id.startsWith("button:") &&
      !usedItemIds.has(raw.id)
    ) {
      restored.push({
        id: raw.id,
        type: "button",
        title:
          typeof raw.title === "string"
            ? raw.title.slice(0, 80)
            : "Mehr erfahren",
        href: typeof raw.href === "string" ? raw.href.slice(0, 1000) : "",
      });
      usedItemIds.add(raw.id);
      continue;
    }

    if (
      raw.type === "banner" &&
      typeof raw.id === "string" &&
      raw.id.startsWith("banner:") &&
      !usedItemIds.has(raw.id)
    ) {
      restored.push({
        id: raw.id,
        type: "banner",
        title:
          typeof raw.title === "string" ? raw.title.slice(0, 100) : "Hinweis",
        content:
          typeof raw.content === "string" ? raw.content.slice(0, 1000) : "",
      });
      usedItemIds.add(raw.id);
    }
  }

  return restored;
};

function ItemControls({
  index,
  itemCount,
  onMove,
  onRemove,
}: {
  index: number;
  itemCount: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        kind="secondary"
        iconOnly
        icon={faArrowUp}
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label="Nach oben verschieben"
      />
      <Button
        kind="secondary"
        iconOnly
        icon={faArrowDown}
        onClick={() => onMove(1)}
        disabled={index === itemCount - 1}
        aria-label="Nach unten verschieben"
      />
      <Button
        kind="danger-secondary"
        iconOnly
        icon={faTrash}
        onClick={onRemove}
        aria-label="Inhalt entfernen"
      />
    </div>
  );
}

export default function GenerateNewsletterClient({
  locale,
  showcases,
  recipientLists,
  issueDefaults,
  rapidmailDefaults,
  rapidmailError,
}: GenerateNewsletterClientProps) {
  const showcaseMap = useMemo(
    () => new Map(showcases.map((showcase) => [showcase.id, showcase])),
    [showcases],
  );
  const [title, setTitle] = useState(issueDefaults.title);
  const [subject, setSubject] = useState(issueDefaults.subject);
  const [intro, setIntro] = useState(issueDefaults.intro);
  const [showShowcasesHeading, setShowShowcasesHeading] = useState(true);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [fromName, setFromName] = useState(rapidmailDefaults.fromName);
  const [fromEmail, setFromEmail] = useState(rapidmailDefaults.fromEmail);
  const [recipientListId, setRecipientListId] = useState(
    rapidmailDefaults.recipientListId
      ? String(rapidmailDefaults.recipientListId)
      : "",
  );
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [busyAction, setBusyAction] = useState<"export" | "draft" | null>(null);
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [isConfigReady, setIsConfigReady] = useState(false);
  const draggedItemId = useRef<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored) as Partial<StoredConfig>;
        if (config.version === 1) {
          if (typeof config.title === "string") setTitle(config.title);
          if (typeof config.subject === "string") setSubject(config.subject);
          if (typeof config.intro === "string") setIntro(config.intro);
          if (typeof config.showShowcasesHeading === "boolean") {
            setShowShowcasesHeading(config.showShowcasesHeading);
          }
          setItems(restoreItems(config.items, showcaseMap));
          setPreviewViewport(
            config.previewViewport === "mobile" ? "mobile" : "desktop",
          );
        }
      }
    } catch {
      // Der Builder bleibt auch ohne localStorage vollständig nutzbar.
    } finally {
      setIsConfigReady(true);
    }
  }, [showcaseMap]);

  useEffect(() => {
    if (!isConfigReady) return;
    const config: StoredConfig = {
      version: 1,
      title,
      subject,
      intro,
      showShowcasesHeading,
      items,
      previewViewport,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Änderungen bleiben im aktuellen Tab erhalten.
    }
  }, [
    intro,
    isConfigReady,
    items,
    previewViewport,
    showShowcasesHeading,
    subject,
    title,
  ]);

  const selectedShowcaseIds = useMemo(
    () =>
      new Set(
        items
          .filter((item): item is ShowcaseItem => item.type === "showcase")
          .map((item) => item.showcaseId),
      ),
    [items],
  );
  const selectedShowcaseCount = selectedShowcaseIds.size;

  const filteredShowcases = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("de");
    if (!normalized) return showcases;

    return showcases.filter((showcase) =>
      [showcase.name, showcase.prettyTitle, showcase.description]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de")
        .includes(normalized),
    );
  }, [deferredQuery, showcases]);

  const requestItems = useMemo(
    () =>
      items.map((item) => {
        if (item.type === "showcase") {
          return {
            type: "showcase" as const,
            showcaseId: item.showcaseId,
            ...item.options,
          };
        }
        if (item.type === "button") {
          return {
            type: "button" as const,
            title: item.title,
            href: item.href,
          };
        }
        return {
          type: "banner" as const,
          title: item.title,
          content: item.content,
        };
      }),
    [items],
  );

  const newsletterPayload = useMemo(
    () => ({
      locale,
      title,
      subject,
      intro,
      showShowcasesHeading,
      items: requestItems,
    }),
    [intro, locale, requestItems, showShowcasesHeading, subject, title],
  );
  const previewRequestBody = useMemo(
    () => JSON.stringify({ ...newsletterPayload, action: "preview" }),
    [newsletterPayload],
  );

  useEffect(() => {
    if (!isConfigReady) return;
    if (selectedShowcaseCount === 0 || !title.trim() || !subject.trim()) {
      setPreviewHtml("");
      setPreviewError(
        selectedShowcaseCount > 0 && (!title.trim() || !subject.trim())
          ? "Titel und Betreffzeile müssen ausgefüllt sein."
          : null,
      );
      setIsPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsPreviewLoading(true);
      setPreviewError(null);
      try {
        const response = await fetch("/api/admin/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: previewRequestBody,
          signal: controller.signal,
        });
        const raw = await response.text();
        if (!response.ok) {
          throw new Error(
            errorMessageFromResponse(
              raw,
              "Newsletter-Vorschau konnte nicht erzeugt werden.",
            ),
          );
        }
        setPreviewHtml(raw);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setPreviewError(
          error instanceof Error
            ? error.message
            : "Newsletter-Vorschau konnte nicht erzeugt werden.",
        );
      } finally {
        if (!controller.signal.aborted) setIsPreviewLoading(false);
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    isConfigReady,
    previewNonce,
    previewRequestBody,
    selectedShowcaseCount,
    subject,
    title,
  ]);

  const toggleShowcase = (showcase: NewsletterShowcase) => {
    if (
      !selectedShowcaseIds.has(showcase.id) &&
      selectedShowcaseCount >= MAX_SELECTED_SHOWCASES
    ) {
      setStatus({
        kind: "error",
        text: `Pro Newsletter sind höchstens ${MAX_SELECTED_SHOWCASES} Beiträge möglich, damit die E-Mail nicht abgeschnitten wird.`,
      });
      return;
    }
    setItems((current) => {
      const existing = current.find(
        (item) => item.type === "showcase" && item.showcaseId === showcase.id,
      );
      return existing
        ? current.filter((item) => item.id !== existing.id)
        : [...current, createShowcaseItem(showcase)];
    });
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const moveItemBefore = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setItems((current) => {
      const source = current.find((item) => item.id === sourceId);
      if (!source) return current;
      const withoutSource = current.filter((item) => item.id !== sourceId);
      const targetIndex = withoutSource.findIndex(
        (item) => item.id === targetId,
      );
      if (targetIndex < 0) return current;
      withoutSource.splice(targetIndex, 0, source);
      return withoutSource;
    });
  };

  const updateShowcaseOptions = (
    id: string,
    patch: Partial<ShowcaseOptions>,
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id && item.type === "showcase"
          ? { ...item, options: { ...item.options, ...patch } }
          : item,
      ),
    );
  };

  const updateButton = (id: string, patch: Partial<ButtonItem>) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id && item.type === "button" ? { ...item, ...patch } : item,
      ),
    );
  };

  const updateBanner = (id: string, patch: Partial<BannerItem>) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id && item.type === "banner" ? { ...item, ...patch } : item,
      ),
    );
  };

  const addButton = () => {
    setItems((current) => [
      ...current,
      {
        id: createCustomId("button"),
        type: "button",
        title: "Mehr erfahren",
        href: "",
      },
    ]);
  };

  const addBanner = () => {
    setItems((current) => [
      ...current,
      {
        id: createCustomId("banner"),
        type: "banner",
        title: "Wichtiger Hinweis",
        content: "",
      },
    ]);
  };

  const addFilteredShowcases = () => {
    const availableSlots = Math.max(
      MAX_SELECTED_SHOWCASES - selectedShowcaseCount,
      0,
    );
    const additions = filteredShowcases
      .filter((showcase) => !selectedShowcaseIds.has(showcase.id))
      .slice(0, availableSlots);
    if (
      filteredShowcases.filter(
        (showcase) => !selectedShowcaseIds.has(showcase.id),
      ).length > additions.length
    ) {
      setStatus({
        kind: "error",
        text: `Die Auswahl wurde auf ${MAX_SELECTED_SHOWCASES} Beiträge begrenzt, damit die E-Mail zuverlässig zugestellt wird.`,
      });
    }
    setItems((current) => {
      return [...current, ...additions.map(createShowcaseItem)];
    });
  };

  const handleExport = async () => {
    if (selectedShowcaseCount === 0) return;
    setBusyAction("export");
    setStatus(null);
    try {
      const response = await fetch("/api/admin/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newsletterPayload, action: "export" }),
      });
      if (!response.ok) {
        const raw = await response.text();
        throw new Error(
          errorMessageFromResponse(
            raw,
            "Newsletter konnte nicht exportiert werden.",
          ),
        );
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? "newsletter.zip";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus({
        kind: "success",
        text: "ZIP mit Newsletter-HTML wurde heruntergeladen.",
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Newsletter konnte nicht exportiert werden.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreateDraft = async () => {
    setBusyAction("draft");
    setStatus(null);
    try {
      const response = await fetch("/api/admin/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newsletterPayload,
          action: "draft",
          fromName,
          fromEmail,
          recipientListId: Number(recipientListId),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as DraftResponse;
      if (!response.ok) {
        throw new Error(
          data.error ?? "Rapidmail-Entwurf konnte nicht erstellt werden.",
        );
      }
      setStatus({
        kind: "success",
        text: `Rapidmail-Entwurf${data.mailing?.id ? ` #${data.mailing.id}` : ""} mit ${data.counts?.showcases ?? selectedShowcaseCount} Beiträgen wurde erstellt.`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Rapidmail-Entwurf konnte nicht erstellt werden.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const canExport =
    selectedShowcaseCount > 0 &&
    Boolean(title.trim()) &&
    Boolean(subject.trim()) &&
    busyAction === null;
  const canCreateDraft =
    canExport &&
    !rapidmailError &&
    Boolean(fromName.trim()) &&
    /^\S+@\S+\.\S+$/.test(fromEmail.trim()) &&
    Boolean(recipientListId) &&
    Boolean(title.trim()) &&
    Boolean(subject.trim());

  return (
    <div className="w-full space-y-6">
      <SubPageTitle
        ressort="oeffentlichkeitsarbeit"
        title="Newsletter zusammenstellen"
        subTitle="Wähle Beiträge aus KongloDigital, ordne sie mit Bannern und Buttons und prüfe das Ergebnis direkt als E-Mail. Erst der letzte Schritt legt einen Entwurf in Rapidmail an – versendet wird hier nichts."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="knglmrt-border-section bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Verfügbare Beiträge
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {showcases.length}
          </p>
        </div>
        <div className="rounded-lg border border-primary-border bg-primary-soft p-4 ">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
            Im Newsletter
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {selectedShowcaseCount}
          </p>
        </div>
        <div className="knglmrt-border-section bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inhaltsblöcke
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {items.length}
          </p>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(430px,0.72fr)]">
        <div className="min-w-0 space-y-6">
          <FormSection
            title="Ausgabe"
            description="Titel und Einstieg erscheinen im Newsletter. Die Betreffzeile wird an Rapidmail übergeben."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Ausgabe / Titel"
                required
                error={!title.trim() ? "Titel fehlt." : undefined}
                value={title}
                maxLength={140}
                onChange={(event) => setTitle(event.target.value)}
              />
              <Field
                label="Betreffzeile"
                required
                error={!subject.trim() ? "Betreffzeile fehlt." : undefined}
                value={subject}
                maxLength={200}
                onChange={(event) => setSubject(event.target.value)}
              />
              <Textarea
                label="Einstieg"
                className="md:col-span-2"
                value={intro}
                rows={6}
                maxLength={4000}
                onChange={(event) => setIntro(event.target.value)}
              />
              <div className="md:col-span-2">
                <Choice
                  label="Überschrift „Was so abgeht“ anzeigen"
                  checked={showShowcasesHeading}
                  onChange={(event) =>
                    setShowShowcasesHeading(event.target.checked)
                  }
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Inhalte und Reihenfolge"
            description="Ausgewählte Beiträge und freie Inhaltsblöcke lassen sich per Pfeilen oder Drag-and-drop sortieren."
          >
            <div className="mb-5 flex flex-wrap gap-2">
              <Button
                type="button"
                kind="primary"
                icon={faPlus}
                onClick={addButton}
              >
                Button
              </Button>
              <Button
                type="button"
                kind="secondary"
                icon={faBullhorn}
                onClick={addBanner}
              >
                Banner
              </Button>
              {items.length > 0 ? (
                <Button
                  type="button"
                  kind="danger-secondary"
                  icon={faTrash}
                  onClick={() => setItems([])}
                >
                  Inhalte leeren
                </Button>
              ) : null}
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-input bg-muted/40 px-5 py-10 text-center">
                <p className="font-semibold text-foreground">
                  Noch keine Inhalte ausgewählt
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Wähle unten mindestens einen Beitrag aus.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => {
                  const showcase =
                    item.type === "showcase"
                      ? showcaseMap.get(item.showcaseId)
                      : null;
                  const imageUrl =
                    item.type === "showcase"
                      ? previewImage(item.options.imageUrl, 180, 120)
                      : null;

                  return (
                    <article
                      key={item.id}
                      draggable
                      onDragStart={() => {
                        draggedItemId.current = item.id;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedItemId.current) {
                          moveItemBefore(draggedItemId.current, item.id);
                        }
                        draggedItemId.current = null;
                      }}
                      onDragEnd={() => {
                        draggedItemId.current = null;
                      }}
                      className={cn(
                        "rounded-lg border p-4 ",
                        item.type === "banner"
                          ? "border-primary-border bg-primary-soft"
                          : "border-border bg-card",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-1 inline-flex cursor-grab items-center gap-2 text-muted-foreground active:cursor-grabbing"
                          title="Zum Sortieren ziehen"
                        >
                          <FontAwesomeIcon
                            icon={faGripVertical}
                            className="h-4 w-4"
                          />
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-bold text-muted-foreground">
                            {index + 1}
                          </span>
                        </span>

                        {item.type === "showcase" ? (
                          imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt=""
                              width={180}
                              height={120}
                              unoptimized
                              className="h-16 w-20 shrink-0 rounded-md border border-border object-cover"
                            />
                          ) : (
                            <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold uppercase text-muted-foreground">
                              Beitrag
                            </span>
                          )
                        ) : (
                          <span
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-md",
                              item.type === "banner"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                            )}
                          >
                            <FontAwesomeIcon
                              icon={
                                item.type === "banner" ? faBullhorn : faLink
                              }
                              className="h-4 w-4"
                            />
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {item.type === "showcase"
                              ? "Beitrag"
                              : item.type === "banner"
                                ? "Banner"
                                : "Eigener Button"}
                          </p>
                          <h3 className="truncate font-semibold text-foreground">
                            {item.type === "showcase"
                              ? (showcase?.name ?? "Nicht verfügbarer Beitrag")
                              : item.title || "Ohne Titel"}
                          </h3>
                          {item.type === "showcase" && showcase ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatDate(
                                showcase.publishDate ?? showcase.updatedAt,
                              )}
                            </p>
                          ) : null}
                        </div>

                        <ItemControls
                          index={index}
                          itemCount={items.length}
                          onMove={(direction) => moveItem(item.id, direction)}
                          onRemove={() =>
                            setItems((current) =>
                              current.filter(
                                (candidate) => candidate.id !== item.id,
                              ),
                            )
                          }
                        />
                      </div>

                      {item.type === "showcase" && showcase ? (
                        <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
                          <NativeSelect
                            label="Layout"
                            value={item.options.layout}
                            onChange={(event) =>
                              updateShowcaseOptions(item.id, {
                                layout: event.target.value as
                                  | "split"
                                  | "stacked",
                              })
                            }
                          >
                            <option value="split">Bild und Text</option>
                            <option value="stacked">Bild über Text</option>
                          </NativeSelect>
                          <NativeSelect
                            label="Bildformat"
                            value={item.options.aspect}
                            disabled={!item.options.imageUrl}
                            onChange={(event) =>
                              updateShowcaseOptions(item.id, {
                                aspect: event.target.value as AspectRatio,
                              })
                            }
                          >
                            <option value="original">Original</option>
                            {ASPECT_RATIOS.filter(
                              (aspect) => aspect !== "original",
                            ).map((aspect) => (
                              <option key={aspect} value={aspect}>
                                {aspect}
                              </option>
                            ))}
                          </NativeSelect>
                          <NativeSelect
                            label="Beitragsbild"
                            value={item.options.imageUrl ?? ""}
                            disabled={showcase.images.length === 0}
                            onChange={(event) =>
                              updateShowcaseOptions(item.id, {
                                imageUrl: event.target.value || null,
                              })
                            }
                          >
                            {showcase.images.length === 0 ? (
                              <option value="">Kein Bild vorhanden</option>
                            ) : null}
                            {showcase.images.map((image, imageIndex) => (
                              <option key={image} value={image}>
                                Bild {imageIndex + 1}
                              </option>
                            ))}
                          </NativeSelect>
                          <Field
                            label="Linktext"
                            value={item.options.linkText}
                            disabled={!item.options.showLink}
                            maxLength={80}
                            onChange={(event) =>
                              updateShowcaseOptions(item.id, {
                                linkText: event.target.value,
                              })
                            }
                          />
                          <div className="sm:col-span-2 xl:col-span-4">
                            <Choice
                              label="Link zum Beitrag anzeigen"
                              checked={item.options.showLink}
                              onChange={(event) =>
                                updateShowcaseOptions(item.id, {
                                  showLink: event.target.checked,
                                })
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {item.type === "button" ? (
                        <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                          <Field
                            label="Buttontext"
                            value={item.title}
                            maxLength={80}
                            onChange={(event) =>
                              updateButton(item.id, {
                                title: event.target.value,
                              })
                            }
                          />
                          <Field
                            label="Ziel-URL"
                            type="url"
                            value={item.href}
                            maxLength={1000}
                            placeholder="https://…"
                            onChange={(event) =>
                              updateButton(item.id, {
                                href: event.target.value,
                              })
                            }
                          />
                        </div>
                      ) : null}

                      {item.type === "banner" ? (
                        <div className="mt-4 grid gap-4 border-t border-primary-border pt-4 sm:grid-cols-2">
                          <Field
                            label="Bannertitel"
                            value={item.title}
                            maxLength={100}
                            onChange={(event) =>
                              updateBanner(item.id, {
                                title: event.target.value,
                              })
                            }
                          />
                          <Textarea
                            label="Bannertext"
                            value={item.content}
                            rows={3}
                            maxLength={1000}
                            onChange={(event) =>
                              updateBanner(item.id, {
                                content: event.target.value,
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </FormSection>

          <FormSection
            title="Beiträge auswählen"
            description="Die Beiträge werden direkt aus KongloDigital geladen. Ein Klick fügt sie am Ende des Newsletters hinzu oder entfernt sie wieder."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field
                label="Beiträge durchsuchen"
                className="flex-1"
                type="search"
                value={query}
                placeholder="Name oder Beschreibung"
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button
                type="button"
                kind="secondary"
                onClick={addFilteredShowcases}
                disabled={
                  selectedShowcaseCount >= MAX_SELECTED_SHOWCASES ||
                  filteredShowcases.length === 0 ||
                  filteredShowcases.every((showcase) =>
                    selectedShowcaseIds.has(showcase.id),
                  )
                }
              >
                {query.trim() ? "Alle Treffer wählen" : "Alle wählen"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Maximal {MAX_SELECTED_SHOWCASES} Beiträge pro Newsletter, damit
              Abmeldelink und Footer in E-Mail-Programmen sichtbar bleiben.
            </p>

            {filteredShowcases.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-input bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
                Keine passenden Beiträge gefunden.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredShowcases.map((showcase) => {
                  const selected = selectedShowcaseIds.has(showcase.id);
                  const limitReached =
                    !selected &&
                    selectedShowcaseCount >= MAX_SELECTED_SHOWCASES;
                  const imageUrl = previewImage(
                    showcase.images[0] ?? null,
                    520,
                    300,
                  );
                  const description = stripText(showcase.description);

                  return (
                    <button
                      key={showcase.id}
                      type="button"
                      onClick={() => toggleShowcase(showcase)}
                      disabled={limitReached}
                      aria-pressed={selected}
                      className={cn(
                        "overflow-hidden rounded-lg border text-left transition focus:outline-none focus:ring-2 focus:ring-ring/30",
                        selected
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-card hover:border-input hover:-translate-y-0.5 hover:shadow-md",
                        limitReached &&
                          "cursor-not-allowed opacity-55 hover:translate-y-0 hover:border-border ",
                      )}
                    >
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt=""
                          width={520}
                          height={300}
                          unoptimized
                          loading="lazy"
                          className="h-36 w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-36 w-full items-center justify-center bg-muted text-xs font-bold uppercase tracking-widest text-muted-foreground">
                          Kein Bild
                        </span>
                      )}
                      <span className="block space-y-2 p-4">
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-semibold leading-snug text-foreground">
                            {showcase.name}
                          </span>
                          <span
                            className={cn(
                              "inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {selected
                              ? "Ausgewählt"
                              : limitReached
                                ? "Limit erreicht"
                                : "Auswählen"}
                          </span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(
                            showcase.publishDate ?? showcase.updatedAt,
                          )}
                        </span>
                        <span className="block text-sm leading-relaxed text-muted-foreground">
                          {description.slice(0, 130) ||
                            "Noch keine Beschreibung hinterlegt."}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </FormSection>

          <FormSection
            title="Rapidmail"
            description="Diese Angaben werden nur beim Anlegen des Entwurfs benötigt. Versand und Terminierung bleiben in Rapidmail."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Absendername"
                required
                value={fromName}
                onChange={(event) => setFromName(event.target.value)}
              />
              <Field
                label="Absender-E-Mail"
                required
                error={
                  fromEmail.trim() && !/^\S+@\S+\.\S+$/.test(fromEmail.trim())
                    ? "Bitte eine gültige E-Mail-Adresse eingeben."
                    : undefined
                }
                type="email"
                value={fromEmail}
                onChange={(event) => setFromEmail(event.target.value)}
              />
              <NativeSelect
                label="Empfängerliste"
                required
                className="md:col-span-2"
                value={recipientListId}
                disabled={recipientLists.length === 0}
                onChange={(event) => setRecipientListId(event.target.value)}
              >
                <option value="">Empfängerliste wählen</option>
                {recipientLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {rapidmailError ? (
              <div className="mt-4 rounded-lg border border-warning-border bg-warning-soft p-4 text-sm text-warning">
                {rapidmailError} Der HTML-/ZIP-Export und die Vorschau bleiben
                verfügbar.
              </div>
            ) : null}
          </FormSection>

          <section className="knglmrt-border-section bg-card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">
                  Newsletter fertigstellen
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedShowcaseCount === 0
                    ? "Wähle mindestens einen Beitrag aus."
                    : `${selectedShowcaseCount} ${selectedShowcaseCount === 1 ? "Beitrag" : "Beiträge"} im Entwurf.`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  kind="secondary"
                  icon={faDownload}
                  disabled={!canExport}
                  onClick={handleExport}
                >
                  {busyAction === "export" ? "Exportiere …" : "HTML + ZIP"}
                </Button>
                <Button
                  type="button"
                  kind="primary"
                  icon={faPaperPlane}
                  disabled={!canCreateDraft}
                  onClick={handleCreateDraft}
                >
                  {busyAction === "draft"
                    ? "Lege Entwurf an …"
                    : "Rapidmail-Entwurf anlegen"}
                </Button>
              </div>
            </div>

            {status ? (
              <div
                className={cn(
                  "mt-4 rounded-lg border p-4 text-sm",
                  status.kind === "success"
                    ? "border-success-border bg-success-soft text-foreground"
                    : "border-destructive-border bg-destructive-soft text-destructive",
                )}
              >
                {status.text}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-6">
          <section className="knglmrt-border-section overflow-hidden bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-semibold text-foreground">
                  E-Mail-Vorschau
                </h2>
                <p className="text-xs text-muted-foreground">
                  {previewViewport === "mobile" ? "390 px" : "580 px"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SegmentedControl
                  value={previewViewport}
                  onChange={setPreviewViewport}
                  options={[
                    {
                      value: "desktop" as const,
                      label: (
                        <>
                          <FontAwesomeIcon
                            icon={faDesktop}
                            className="h-3.5 w-3.5"
                          />
                          Desktop
                        </>
                      ),
                    },
                    {
                      value: "mobile" as const,
                      label: (
                        <>
                          <FontAwesomeIcon
                            icon={faMobileScreen}
                            className="h-3.5 w-3.5"
                          />
                          Mobil
                        </>
                      ),
                    },
                  ]}
                />
                <Button
                  kind="ghost"
                  iconOnly
                  icon={faRotate}
                  onClick={() => setPreviewNonce((current) => current + 1)}
                  disabled={selectedShowcaseCount === 0}
                  loading={isPreviewLoading}
                  aria-label="Vorschau neu laden"
                />
              </div>
            </header>

            {previewError ? (
              <div className="border-b border-destructive-border bg-destructive-soft px-4 py-3 text-sm text-destructive">
                {previewError}
              </div>
            ) : null}

            <div className="min-h-[760px] overflow-x-auto bg-muted/50 p-3 sm:p-5">
              {previewHtml ? (
                <div
                  className="mx-auto overflow-hidden rounded-md bg-white shadow-lg transition-[width] duration-200"
                  style={{
                    width: previewViewport === "mobile" ? 390 : 640,
                    maxWidth: "100%",
                  }}
                >
                  <iframe
                    title={`Newsletter-Vorschau – ${
                      previewViewport === "mobile" ? "Mobil" : "Desktop"
                    }`}
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin"
                    className="h-[740px] w-full border-0 bg-white"
                  />
                </div>
              ) : (
                <div className="flex min-h-[720px] items-center justify-center rounded-md border border-dashed border-input bg-card px-8 text-center">
                  <div>
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <FontAwesomeIcon
                        icon={faPaperPlane}
                        className="h-5 w-5"
                      />
                    </span>
                    <p className="mt-4 font-semibold text-foreground">
                      Vorschau wartet auf Inhalte
                    </p>
                    <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      Sobald du einen Beitrag auswählst, wird die echte
                      E-Mail-Vorschau automatisch erzeugt.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
