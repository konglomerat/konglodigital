"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  faArrowDown,
  faArrowUp,
  faBullhorn,
  faDesktop,
  faDownload,
  faFileCirclePlus,
  faFloppyDisk,
  faGripVertical,
  faLink,
  faMobileScreen,
  faPalette,
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

import NewsletterImagePositionDialog, {
  type NewsletterImagePosition,
} from "./NewsletterImagePositionDialog";

type NewsletterShowcase = {
  id: string;
  name: string;
  prettyTitle: string | null;
  excerpt: string | null;
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

type NewsletterDesign = "konglomerat" | "volkshaus-cotta";

type ShowcaseOptions = {
  excerpt: string;
  layout: "split" | "stacked";
  aspect: AspectRatio;
  imageMode: "single" | "gif";
  imageUrl: string | null;
  imagePositions: Record<string, NewsletterImagePosition>;
  gifImageUrls: string[];
  gifFrameDurationMs: number;
  showLink: boolean;
  linkText: string;
  href: string;
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

type NewsletterDraftContent = {
  version: 2;
  title: string;
  subject: string;
  intro: string;
  showShowcasesHeading: boolean;
  items: BuilderItem[];
  previewViewport: "desktop" | "mobile";
  fromName: string;
  fromEmail: string;
  recipientListId: string;
};

type StoredConfig = Partial<Omit<NewsletterDraftContent, "version">> & {
  version?: 1 | 2;
  design?: NewsletterDesign;
  draftName?: string;
};

type NewsletterDraftRecord = {
  id: string;
  name: string;
  design: NewsletterDesign;
  content: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type NewsletterDraftsApiResponse = {
  error?: string;
  drafts?: NewsletterDraftRecord[];
  draft?: NewsletterDraftRecord;
};

type ProjectExcerptSaveState = {
  kind: "saving" | "saved" | "error";
  message: string;
};

const STORAGE_KEY = "konglodigital.newsletter.config.v1";
const MAX_SELECTED_SHOWCASES = 24;
const MAX_GIF_FRAMES = 12;
const GIF_IMAGE_OPTION = "__animated_gif__";
const GIF_SPEED_OPTIONS = [
  200,
  400,
  700,
  1_000,
  1_500,
  2_000,
  3_000,
  5_000,
];
const ASPECT_RATIOS: AspectRatio[] = [
  "original",
  "1:1",
  "4:3",
  "3:2",
  "16:9",
  "4:5",
  "3:4",
];
const ASPECT_RATIO_VALUES: Record<Exclude<AspectRatio, "original">, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
};
const CENTER_IMAGE_POSITION: NewsletterImagePosition = { x: 0.5, y: 0.5 };

type ImagePositionSession = {
  itemId: string;
  imageUrl: string;
  imageLabel: string;
  aspect: Exclude<AspectRatio, "original">;
  initialPosition: NewsletterImagePosition;
};

const normalizeDesign = (value: unknown): NewsletterDesign =>
  value === "volkshaus-cotta" ? "volkshaus-cotta" : "konglomerat";

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

const formatSavedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(parsed);
};

const draftSnapshot = (
  name: string,
  design: NewsletterDesign,
  content: NewsletterDraftContent,
) => JSON.stringify({ name, design, content });

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

const clampImagePosition = (value: number) =>
  Math.min(1, Math.max(0, value));

const normalizeImagePositions = (
  value: unknown,
  availableImages: string[],
): Record<string, NewsletterImagePosition> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const rawPositions = value as Record<string, unknown>;
  return Object.fromEntries(
    availableImages.flatMap((imageUrl) => {
      const rawPosition = rawPositions[imageUrl];
      if (
        !rawPosition ||
        typeof rawPosition !== "object" ||
        Array.isArray(rawPosition)
      ) {
        return [];
      }

      const { x, y } = rawPosition as Record<string, unknown>;
      const parsedX = Number(x);
      const parsedY = Number(y);
      if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY)) return [];

      return [
        [
          imageUrl,
          {
            x: clampImagePosition(parsedX),
            y: clampImagePosition(parsedY),
          },
        ] as const,
      ];
    }),
  );
};

const createShowcaseItem = (showcase: NewsletterShowcase): ShowcaseItem => ({
  id: `showcase:${showcase.id}`,
  type: "showcase",
  showcaseId: showcase.id,
  options: {
    excerpt: showcase.excerpt?.trim() || showcase.description || "",
    layout: "split",
    aspect: "original",
    imageMode: "single",
    imageUrl: showcase.images[0] ?? null,
    imagePositions: {},
    gifImageUrls: showcase.images.slice(0, 4),
    gifFrameDurationMs: 1_000,
    showLink: true,
    linkText: "Weiterlesen",
    href: showcase.href,
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
      const gifImageUrls = Array.isArray(raw.options?.gifImageUrls)
        ? Array.from(
            new Set(
              raw.options.gifImageUrls.filter(
                (value): value is string =>
                  typeof value === "string" && showcase.images.includes(value),
              ),
            ),
          ).slice(0, MAX_GIF_FRAMES)
        : showcase.images.slice(0, 4);
      const requestedGifDuration = Number(raw.options?.gifFrameDurationMs);
      const gifFrameDurationMs = GIF_SPEED_OPTIONS.includes(requestedGifDuration)
        ? requestedGifDuration
        : 1_000;
      const imagePositions = normalizeImagePositions(
        raw.options?.imagePositions,
        showcase.images,
      );

      restored.push({
        id: `showcase:${showcase.id}`,
        type: "showcase",
        showcaseId: showcase.id,
        options: {
          excerpt:
            typeof raw.options?.excerpt === "string"
              ? raw.options.excerpt.slice(0, 5_000)
              : showcase.excerpt?.trim() || showcase.description || "",
          layout: raw.options?.layout === "stacked" ? "stacked" : "split",
          aspect,
          imageMode:
            raw.options?.imageMode === "gif" && showcase.images.length >= 2
              ? "gif"
              : "single",
          imageUrl,
          imagePositions,
          gifImageUrls,
          gifFrameDurationMs,
          showLink: raw.options?.showLink !== false,
          linkText:
            typeof raw.options?.linkText === "string" &&
            raw.options.linkText.trim()
              ? raw.options.linkText.trim().slice(0, 80)
              : "Weiterlesen",
          href:
            typeof raw.options?.href === "string"
              ? raw.options.href.slice(0, 2_000)
              : showcase.href,
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
  const [design, setDesign] = useState<NewsletterDesign>("konglomerat");
  const [showShowcasesHeading, setShowShowcasesHeading] = useState(true);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [query, setQuery] = useState("");
  const [isProjectLibraryOpen, setIsProjectLibraryOpen] = useState(false);
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
  const [previewHeight, setPreviewHeight] = useState(740);
  const [busyAction, setBusyAction] = useState<"export" | "draft" | null>(null);
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [drafts, setDrafts] = useState<NewsletterDraftRecord[]>([]);
  const [activeDraftId, setActiveDraftId] = useState("");
  const [draftName, setDraftName] = useState(issueDefaults.title);
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState<string | null>(
    null,
  );
  const [isDraftsLoading, setIsDraftsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null);
  const [isConfigReady, setIsConfigReady] = useState(false);
  const [imagePositionSession, setImagePositionSession] =
    useState<ImagePositionSession | null>(null);
  const [projectExcerptSaveStates, setProjectExcerptSaveStates] = useState<
    Record<string, ProjectExcerptSaveState>
  >({});
  const projectExcerptSaveTimers = useRef<Map<string, number>>(new Map());
  const projectExcerptLatestValues = useRef<Map<string, string>>(new Map());
  const projectExcerptSavesInFlight = useRef<Set<string>>(new Set());
  const draggedItemId = useRef<string | null>(null);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewResizeObserver = useRef<ResizeObserver | null>(null);

  const handlePreviewFrameLoad = () => {
    previewResizeObserver.current?.disconnect();

    const frame = previewFrameRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frame || !frameDocument) return;

    const emailRoot =
      frameDocument.querySelector<HTMLElement>(".email-center") ??
      frameDocument.body;

    const updatePreviewHeight = () => {
      if (previewFrameRef.current?.contentDocument !== frameDocument) return;
      const nextHeight = Math.ceil(emailRoot.getBoundingClientRect().height);
      if (nextHeight > 0) setPreviewHeight(nextHeight);
    };

    updatePreviewHeight();

    const observer = new ResizeObserver(updatePreviewHeight);
    observer.observe(emailRoot);
    previewResizeObserver.current = observer;

    void frameDocument.fonts.ready.then(updatePreviewHeight);
  };

  const currentDraftContent = useMemo<NewsletterDraftContent>(
    () => ({
      version: 2,
      title,
      subject,
      intro,
      showShowcasesHeading,
      items,
      previewViewport,
      fromName,
      fromEmail,
      recipientListId,
    }),
    [
      fromEmail,
      fromName,
      intro,
      items,
      previewViewport,
      recipientListId,
      showShowcasesHeading,
      subject,
      title,
    ],
  );
  const currentDraftSnapshot = useMemo(
    () => draftSnapshot(draftName.trim(), design, currentDraftContent),
    [currentDraftContent, design, draftName],
  );
  const newDraftSnapshot = useMemo(
    () =>
      draftSnapshot(issueDefaults.title, "konglomerat", {
        version: 2,
        title: issueDefaults.title,
        subject: issueDefaults.subject,
        intro: issueDefaults.intro,
        showShowcasesHeading: true,
        items: [],
        previewViewport: "desktop",
        fromName: rapidmailDefaults.fromName,
        fromEmail: rapidmailDefaults.fromEmail,
        recipientListId: rapidmailDefaults.recipientListId
          ? String(rapidmailDefaults.recipientListId)
          : "",
      }),
    [issueDefaults, rapidmailDefaults],
  );
  const isDraftDirty = activeDraftId
    ? savedDraftSnapshot !== currentDraftSnapshot
    : currentDraftSnapshot !== newDraftSnapshot;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored) as StoredConfig;
        if (config.version === 1 || config.version === 2) {
          if (typeof config.title === "string") setTitle(config.title);
          if (typeof config.subject === "string") setSubject(config.subject);
          if (typeof config.intro === "string") setIntro(config.intro);
          setDesign(normalizeDesign(config.design));
          if (typeof config.draftName === "string") {
            setDraftName(config.draftName.slice(0, 160));
          }
          if (typeof config.showShowcasesHeading === "boolean") {
            setShowShowcasesHeading(config.showShowcasesHeading);
          }
          setItems(restoreItems(config.items, showcaseMap));
          setPreviewViewport(
            config.previewViewport === "mobile" ? "mobile" : "desktop",
          );
          if (typeof config.fromName === "string") {
            setFromName(config.fromName.slice(0, 160));
          }
          if (typeof config.fromEmail === "string") {
            setFromEmail(config.fromEmail.slice(0, 320));
          }
          if (typeof config.recipientListId === "string") {
            setRecipientListId(config.recipientListId);
          }
        }
      }
    } catch {
      // Der Builder bleibt auch ohne localStorage vollständig nutzbar.
    } finally {
      setIsConfigReady(true);
    }
  }, [showcaseMap]);

  useEffect(() => {
    const controller = new AbortController();

    const loadDrafts = async () => {
      setIsDraftsLoading(true);
      setDraftStorageError(null);
      try {
        const response = await fetch("/api/admin/newsletter-drafts", {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as NewsletterDraftsApiResponse;
        if (!response.ok) {
          throw new Error(
            data.error ?? "Newsletter-Entwürfe konnten nicht geladen werden.",
          );
        }
        setDrafts(data.drafts ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDraftStorageError(
          error instanceof Error
            ? error.message
            : "Newsletter-Entwürfe konnten nicht geladen werden.",
        );
      } finally {
        if (!controller.signal.aborted) setIsDraftsLoading(false);
      }
    };

    void loadDrafts();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isConfigReady) return;
    const config: StoredConfig = {
      ...currentDraftContent,
      design,
      draftName,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Änderungen bleiben im aktuellen Tab erhalten.
    }
  }, [
    currentDraftContent,
    design,
    draftName,
    isConfigReady,
  ]);

  useEffect(() => {
    if (!isProjectLibraryOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsProjectLibraryOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProjectLibraryOpen]);

  useEffect(
    () => () => {
      projectExcerptSaveTimers.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      previewResizeObserver.current?.disconnect();
    },
    [],
  );

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
  const hasInvalidGif = items.some(
    (item) =>
      item.type === "showcase" &&
      item.options.imageMode === "gif" &&
      item.options.gifImageUrls.length < 2,
  );

  const filteredShowcases = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("de");
    if (!normalized) return showcases;

    return showcases.filter((showcase) =>
      [
        showcase.name,
        showcase.prettyTitle,
        showcase.excerpt,
        showcase.description,
      ]
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
      design,
      title,
      subject,
      intro,
      showShowcasesHeading,
      items: requestItems,
    }),
    [design, intro, locale, requestItems, showShowcasesHeading, subject, title],
  );
  const previewRequestBody = useMemo(
    () => JSON.stringify({ ...newsletterPayload, action: "preview" }),
    [newsletterPayload],
  );

  useEffect(() => {
    if (!isConfigReady) return;
    if (
      selectedShowcaseCount === 0 ||
      hasInvalidGif ||
      !title.trim() ||
      !subject.trim()
    ) {
      setPreviewHtml("");
      setPreviewError(
        hasInvalidGif
          ? "Wähle für jedes GIF mindestens zwei Bilder aus."
          : selectedShowcaseCount > 0 && (!title.trim() || !subject.trim())
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
    hasInvalidGif,
    previewNonce,
    previewRequestBody,
    selectedShowcaseCount,
    subject,
    title,
  ]);

  const addShowcase = (showcase: NewsletterShowcase) => {
    if (selectedShowcaseIds.has(showcase.id)) return;
    if (selectedShowcaseCount >= MAX_SELECTED_SHOWCASES) {
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
      return existing ? current : [...current, createShowcaseItem(showcase)];
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

  const persistShowcaseExcerpt = async (showcaseId: string) => {
    if (projectExcerptSavesInFlight.current.has(showcaseId)) return;
    const excerpt = projectExcerptLatestValues.current.get(showcaseId);
    if (excerpt === undefined) return;

    projectExcerptSavesInFlight.current.add(showcaseId);
    try {
      const response = await fetch("/api/admin/newsletter/project-excerpt", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showcaseId, excerpt }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error ?? "Beitragstext konnte nicht gespeichert werden.",
        );
      }
      if (projectExcerptLatestValues.current.get(showcaseId) === excerpt) {
        setProjectExcerptSaveStates((current) => ({
          ...current,
          [showcaseId]: {
            kind: "saved",
            message: "Im Beitrag gespeichert.",
          },
        }));
      }
    } catch (error) {
      if (projectExcerptLatestValues.current.get(showcaseId) === excerpt) {
        setProjectExcerptSaveStates((current) => ({
          ...current,
          [showcaseId]: {
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Beitragstext konnte nicht gespeichert werden.",
          },
        }));
      }
    } finally {
      projectExcerptSavesInFlight.current.delete(showcaseId);
      if (projectExcerptLatestValues.current.get(showcaseId) !== excerpt) {
        void persistShowcaseExcerpt(showcaseId);
      }
    }
  };

  const updateShowcaseExcerpt = (
    itemId: string,
    showcaseId: string,
    value: string,
  ) => {
    const excerpt = value.slice(0, 5_000);
    updateShowcaseOptions(itemId, { excerpt });
    projectExcerptLatestValues.current.set(showcaseId, excerpt);
    setProjectExcerptSaveStates((current) => ({
      ...current,
      [showcaseId]: {
        kind: "saving",
        message: "Wird im Beitrag gespeichert …",
      },
    }));

    const previousTimer = projectExcerptSaveTimers.current.get(showcaseId);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      projectExcerptSaveTimers.current.delete(showcaseId);
      void persistShowcaseExcerpt(showcaseId);
    }, 650);
    projectExcerptSaveTimers.current.set(showcaseId, timer);
  };

  const flushShowcaseExcerpt = (showcaseId: string) => {
    const timer = projectExcerptSaveTimers.current.get(showcaseId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      projectExcerptSaveTimers.current.delete(showcaseId);
    }
    void persistShowcaseExcerpt(showcaseId);
  };

  const openImagePositionDialog = (
    item: ShowcaseItem,
    showcase: NewsletterShowcase,
    imageUrl: string,
  ) => {
    if (item.options.aspect === "original") return;
    const imageIndex = showcase.images.indexOf(imageUrl);
    setImagePositionSession({
      itemId: item.id,
      imageUrl,
      imageLabel:
        imageIndex >= 0
          ? `${showcase.name} · Bild ${imageIndex + 1}`
          : showcase.name,
      aspect: item.options.aspect,
      initialPosition:
        item.options.imagePositions[imageUrl] ?? CENTER_IMAGE_POSITION,
    });
  };

  const applyImagePosition = (position: NewsletterImagePosition) => {
    if (!imagePositionSession) return;
    const { itemId, imageUrl } = imagePositionSession;
    setItems((current) =>
      current.map((item) =>
        item.id === itemId && item.type === "showcase"
          ? {
              ...item,
              options: {
                ...item.options,
                imagePositions: {
                  ...item.options.imagePositions,
                  [imageUrl]: position,
                },
              },
            }
          : item,
      ),
    );
    setImagePositionSession(null);
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

  const resetToNewDraft = () => {
    const defaultRecipientListId = rapidmailDefaults.recipientListId
      ? String(rapidmailDefaults.recipientListId)
      : "";
    setActiveDraftId("");
    setDraftName(issueDefaults.title);
    setDesign("konglomerat");
    setTitle(issueDefaults.title);
    setSubject(issueDefaults.subject);
    setIntro(issueDefaults.intro);
    setShowShowcasesHeading(true);
    setItems([]);
    setPreviewViewport("desktop");
    setFromName(rapidmailDefaults.fromName);
    setFromEmail(rapidmailDefaults.fromEmail);
    setRecipientListId(defaultRecipientListId);
    setSavedDraftSnapshot(null);
    setStatus(null);
  };

  const startNewDraft = () => {
    if (
      isDraftDirty &&
      !window.confirm(
        "Ungespeicherte Änderungen verwerfen und einen neuen Entwurf beginnen?",
      )
    ) {
      return;
    }
    resetToNewDraft();
  };

  const applyDraft = (draft: NewsletterDraftRecord) => {
    const raw = draft.content as Partial<NewsletterDraftContent>;
    const normalizedContent: NewsletterDraftContent = {
      version: 2,
      title:
        typeof raw.title === "string"
          ? raw.title.slice(0, 240)
          : issueDefaults.title,
      subject:
        typeof raw.subject === "string"
          ? raw.subject.slice(0, 240)
          : issueDefaults.subject,
      intro:
        typeof raw.intro === "string"
          ? raw.intro.slice(0, 5_000)
          : issueDefaults.intro,
      showShowcasesHeading: raw.showShowcasesHeading !== false,
      items: restoreItems(raw.items, showcaseMap),
      previewViewport:
        raw.previewViewport === "mobile" ? "mobile" : "desktop",
      fromName:
        typeof raw.fromName === "string"
          ? raw.fromName.slice(0, 160)
          : rapidmailDefaults.fromName,
      fromEmail:
        typeof raw.fromEmail === "string"
          ? raw.fromEmail.slice(0, 320)
          : rapidmailDefaults.fromEmail,
      recipientListId:
        typeof raw.recipientListId === "string"
          ? raw.recipientListId
          : rapidmailDefaults.recipientListId
            ? String(rapidmailDefaults.recipientListId)
            : "",
    };
    const normalizedDesign = normalizeDesign(draft.design);

    setActiveDraftId(draft.id);
    setDraftName(draft.name);
    setDesign(normalizedDesign);
    setTitle(normalizedContent.title);
    setSubject(normalizedContent.subject);
    setIntro(normalizedContent.intro);
    setShowShowcasesHeading(normalizedContent.showShowcasesHeading);
    setItems(normalizedContent.items);
    setPreviewViewport(normalizedContent.previewViewport);
    setFromName(normalizedContent.fromName);
    setFromEmail(normalizedContent.fromEmail);
    setRecipientListId(normalizedContent.recipientListId);
    setSavedDraftSnapshot(
      draftSnapshot(draft.name, normalizedDesign, normalizedContent),
    );
    setStatus(null);
  };

  const handleDraftSelection = (id: string) => {
    if (id === activeDraftId) return;
    if (
      isDraftDirty &&
      !window.confirm(
        "Ungespeicherte Änderungen verwerfen und einen anderen Entwurf öffnen?",
      )
    ) {
      return;
    }
    if (!id) {
      resetToNewDraft();
      return;
    }

    const draft = drafts.find((entry) => entry.id === id);
    if (draft) applyDraft(draft);
  };

  const handleSaveIntermediateDraft = async () => {
    const normalizedName =
      draftName.trim() || title.trim() || "Unbenannter Entwurf";
    setIsSavingDraft(true);
    setDraftStorageError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/newsletter-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeDraftId || undefined,
          name: normalizedName,
          design,
          content: currentDraftContent,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as NewsletterDraftsApiResponse;
      if (!response.ok || !data.draft) {
        throw new Error(
          data.error ?? "Newsletter-Entwurf konnte nicht gespeichert werden.",
        );
      }

      const savedDraft = data.draft;
      setDraftName(savedDraft.name);
      setActiveDraftId(savedDraft.id);
      setDrafts((current) =>
        [savedDraft, ...current.filter((entry) => entry.id !== savedDraft.id)].sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        ),
      );
      setSavedDraftSnapshot(
        draftSnapshot(savedDraft.name, savedDraft.design, currentDraftContent),
      );
      setStatus({
        kind: "success",
        text: "Entwurf in der Datenbank zwischengespeichert.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Newsletter-Entwurf konnte nicht gespeichert werden.";
      setDraftStorageError(message);
      setStatus({ kind: "error", text: message });
    } finally {
      setIsSavingDraft(false);
    }
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
    !hasInvalidGif &&
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
  const canSaveIntermediateDraft =
    !isSavingDraft && Boolean(draftName.trim() || title.trim());
  const activeDraft = drafts.find((entry) => entry.id === activeDraftId);

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

      <FormSection title="Entwürfe" icon={faFloppyDisk}>
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_auto] lg:items-end">
          <NativeSelect
            label="Gespeicherter Entwurf"
            value={activeDraftId}
            disabled={isDraftsLoading}
            onChange={(event) => handleDraftSelection(event.target.value)}
          >
            <option value="">
              {isDraftsLoading
                ? "Entwürfe werden geladen …"
                : "Neuer, ungespeicherter Entwurf"}
            </option>
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.name} · {formatSavedAt(draft.updatedAt)}
              </option>
            ))}
          </NativeSelect>
          <Field
            label="Entwurfsname"
            value={draftName}
            maxLength={160}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              kind="secondary"
              icon={faFileCirclePlus}
              onClick={startNewDraft}
            >
              Neuer Entwurf
            </Button>
            <Button
              type="button"
              kind="primary"
              icon={faFloppyDisk}
              disabled={!canSaveIntermediateDraft}
              onClick={handleSaveIntermediateDraft}
            >
              {isSavingDraft ? "Speichert …" : "Zwischenspeichern"}
            </Button>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          {activeDraft ? (
            <span>
              {isDraftDirty ? "Ungespeicherte Änderungen" : "Gespeichert"} · zuletzt{" "}
              {formatSavedAt(activeDraft.updatedAt)}
            </span>
          ) : (
            <span>Noch nicht in der Datenbank gespeichert.</span>
          )}
        </div>
        {draftStorageError ? (
          <div className="mt-4 rounded-lg border border-warning-border bg-warning-soft p-4 text-sm text-warning">
            {draftStorageError}
          </div>
        ) : null}
      </FormSection>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0 space-y-6">
          <FormSection title="Design" icon={faPalette}>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={design === "konglomerat"}
                onClick={() => setDesign("konglomerat")}
                className={cn(
                  "rounded-lg border p-4 text-left transition",
                  design === "konglomerat"
                    ? "border-primary bg-primary-soft shadow-sm"
                    : "border-border bg-card hover:border-input hover:bg-muted/40",
                )}
              >
                <span className="mb-3 flex h-12 overflow-hidden rounded-md border border-black/10">
                  <span className="w-1/3 bg-[#ff3366]" />
                  <span className="w-2/3 bg-[#ffe7ed]" />
                </span>
                <span className="block font-semibold text-foreground">
                  Konglomerat
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Pink, grafisch und werkstattnah
                </span>
              </button>
              <button
                type="button"
                aria-pressed={design === "volkshaus-cotta"}
                onClick={() => setDesign("volkshaus-cotta")}
                className={cn(
                  "rounded-lg border p-4 text-left transition",
                  design === "volkshaus-cotta"
                    ? "border-[#e8de2d] bg-[#fffef1] shadow-sm"
                    : "border-border bg-card hover:border-input hover:bg-muted/40",
                )}
              >
                <span className="mb-3 flex h-12 items-end overflow-hidden rounded-md border border-black/10 bg-[#e8de2d] px-3 pt-2">
                  <span className="h-8 w-2/5 bg-[#43c7bd]" />
                  <span className="h-6 w-1/4 bg-white" />
                  <span className="h-7 flex-1 bg-[#cf2083]" />
                </span>
                <span className="block font-semibold text-foreground">
                  Neues Volkshaus Cotta
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Gelb, klar und mit den Originalgrafiken des Hauses
                </span>
              </button>
            </div>
          </FormSection>

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
                  label={`Überschrift „${
                    design === "volkshaus-cotta"
                      ? "Neues aus dem Haus"
                      : "Was so abgeht"
                  }“ anzeigen`}
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
            description="Hier bearbeitest und sortierst du Beiträge und freie Inhaltsblöcke. Neue Beiträge wählst du in der Beitragsbibliothek aus."
          >
            <div className="mb-5 flex flex-wrap gap-2">
              <Button
                type="button"
                kind="primary"
                icon={faPlus}
                onClick={() => setIsProjectLibraryOpen(true)}
              >
                Beiträge hinzufügen
              </Button>
              <Button type="button" kind="secondary" icon={faLink} onClick={addButton}>
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
                  Öffne die Beitragsbibliothek und füge den ersten Beitrag hinzu.
                </p>
                <Button
                  type="button"
                  kind="primary"
                  icon={faPlus}
                  className="mt-4"
                  onClick={() => setIsProjectLibraryOpen(true)}
                >
                  Beitragsbibliothek öffnen
                </Button>
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
                      ? previewImage(
                          item.options.imageMode === "gif"
                            ? (item.options.gifImageUrls[0] ?? null)
                            : item.options.imageUrl,
                          180,
                          120,
                        )
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
                          <div className="space-y-2 sm:col-span-2 xl:col-span-4">
                            <Textarea
                            label="Newslettertext / Excerpt (Markdown)"
                            error={
                              projectExcerptSaveStates[showcase.id]?.kind ===
                              "error"
                                ? projectExcerptSaveStates[showcase.id].message
                                : undefined
                            }
                            value={item.options.excerpt}
                            rows={5}
                            maxLength={5_000}
                            placeholder={
                              showcase.description ||
                              "Kurzen Beitragstext für den Newsletter eingeben …"
                            }
                            onChange={(event) =>
                              updateShowcaseExcerpt(
                                item.id,
                                showcase.id,
                                event.target.value,
                              )
                            }
                            onBlur={() => flushShowcaseExcerpt(showcase.id)}
                          />
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>
                                Änderungen erscheinen live in der Vorschau und
                                werden am Beitrag gespeichert.
                              </span>
                              <span aria-live="polite" className="font-semibold">
                                {projectExcerptSaveStates[showcase.id]?.kind ===
                                "saving"
                                  ? projectExcerptSaveStates[showcase.id].message
                                  : projectExcerptSaveStates[showcase.id]?.kind ===
                                      "saved"
                                    ? projectExcerptSaveStates[showcase.id].message
                                    : null}
                              </span>
                            </div>
                          </div>
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
                              disabled={
                                item.options.imageMode === "gif"
                                  ? item.options.gifImageUrls.length === 0
                                  : !item.options.imageUrl
                              }
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
                          <div className="space-y-2">
                            <NativeSelect
                            label="Beitragsbild"
                            error={
                              item.options.imageMode === "gif" &&
                              item.options.gifImageUrls.length < 2
                                ? "Wähle mindestens zwei Bilder für das GIF aus."
                                : undefined
                            }
                              value={
                                item.options.imageMode === "gif"
                                  ? GIF_IMAGE_OPTION
                                  : (item.options.imageUrl ?? "")
                              }
                              disabled={showcase.images.length === 0}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value === GIF_IMAGE_OPTION) {
                                  updateShowcaseOptions(item.id, {
                                    imageMode: "gif",
                                    gifImageUrls:
                                      item.options.gifImageUrls.length >= 2
                                        ? item.options.gifImageUrls
                                        : showcase.images.slice(0, 4),
                                  });
                                  return;
                                }
                                updateShowcaseOptions(item.id, {
                                  imageMode: "single",
                                  imageUrl: value || null,
                                });
                              }}
                            >
                              {showcase.images.length === 0 ? (
                                <option value="">Kein Bild vorhanden</option>
                              ) : null}
                              {showcase.images.map((image, imageIndex) => (
                                <option key={image} value={image}>
                                  Bild {imageIndex + 1}
                                </option>
                              ))}
                              {showcase.images.length >= 2 ? (
                                <option value={GIF_IMAGE_OPTION}>
                                  GIF aus mehreren Bildern
                                </option>
                              ) : null}
                            </NativeSelect>
                            {item.options.imageMode === "single" &&
                            item.options.imageUrl &&
                            item.options.aspect !== "original" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openImagePositionDialog(
                                    item,
                                    showcase,
                                    item.options.imageUrl!,
                                  )
                                }
                                className="mt-2 inline-flex text-xs font-semibold text-primary underline-offset-2 hover:underline"
                              >
                                {item.options.imagePositions[
                                  item.options.imageUrl
                                ]
                                  ? "Bildausschnitt anpassen"
                                  : "Bildausschnitt wählen"}
                              </button>
                            ) : null}
                          </div>
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
                          <Field
                            label="Ziel-URL"
                            type="url"
                            value={item.options.href}
                            disabled={!item.options.showLink}
                            maxLength={2_000}
                            hint="Kann auf eine beliebige Webseite oder einen eigenen Pfad verweisen."
                            className="sm:col-span-2 xl:col-span-3"
                            onChange={(event) =>
                              updateShowcaseOptions(item.id, {
                                href: event.target.value,
                              })
                            }
                          />
                          {item.options.imageMode === "gif" ? (
                            <div className="space-y-4 rounded-lg border border-primary-border bg-primary-soft/40 p-4 sm:col-span-2 xl:col-span-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-foreground">
                                    Bilder im GIF
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Die ausgewählten Bilder laufen in dieser Reihenfolge
                                    als Endlosschleife. Maximal {MAX_GIF_FRAMES} Bilder.
                                  </p>
                                </div>
                                <span className="rounded-full bg-card px-2.5 py-1 text-xs font-bold text-foreground shadow-sm">
                                  {item.options.gifImageUrls.length} ausgewählt
                                </span>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                {showcase.images.map((image, imageIndex) => {
                                  const checked =
                                    item.options.gifImageUrls.includes(image);
                                  const limitReached =
                                    !checked &&
                                    item.options.gifImageUrls.length >=
                                      MAX_GIF_FRAMES;
                                  const thumbnail = previewImage(image, 240, 150);

                                  return (
                                    <div
                                      key={image}
                                      className={cn(
                                        "overflow-hidden rounded-md border bg-card transition",
                                        checked
                                          ? "border-primary shadow-sm"
                                          : "border-border hover:border-input",
                                        limitReached && "opacity-50",
                                      )}
                                    >
                                      {thumbnail ? (
                                        <Image
                                          src={thumbnail}
                                          alt=""
                                          width={240}
                                          height={150}
                                          unoptimized
                                          className="h-20 w-full object-cover"
                                        />
                                      ) : null}
                                      <label
                                        className={cn(
                                          "flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground",
                                          limitReached
                                            ? "cursor-not-allowed"
                                            : "cursor-pointer",
                                        )}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={limitReached}
                                          onChange={(event) => {
                                            const selected = event.target.checked
                                              ? [
                                                  ...item.options.gifImageUrls,
                                                  image,
                                                ]
                                              : item.options.gifImageUrls.filter(
                                                  (value) => value !== image,
                                                );
                                            updateShowcaseOptions(item.id, {
                                              gifImageUrls: showcase.images.filter(
                                                (value) =>
                                                  selected.includes(value),
                                              ),
                                            });
                                          }}
                                          className="h-4 w-4 rounded border-input text-primary"
                                        />
                                        Bild {imageIndex + 1}
                                      </label>
                                      {checked &&
                                      item.options.aspect !== "original" ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openImagePositionDialog(
                                              item,
                                              showcase,
                                              image,
                                            )
                                          }
                                          className="mx-3 mb-3 inline-flex text-xs font-semibold text-primary underline-offset-2 hover:underline"
                                        >
                                          {item.options.imagePositions[image]
                                            ? "Ausschnitt anpassen"
                                            : "Ausschnitt wählen"}
                                        </button>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>

                              <NativeSelect
                                label="Wechseltempo"
                                className="max-w-xs"
                                hint="Die Zeit gibt an, wie lange jedes Bild sichtbar bleibt."
                                  value={String(
                                    item.options.gifFrameDurationMs,
                                  )}
                                  onChange={(event) =>
                                    updateShowcaseOptions(item.id, {
                                      gifFrameDurationMs: Number(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                >
                                  {GIF_SPEED_OPTIONS.map((duration) => (
                                    <option key={duration} value={duration}>
                                      {(duration / 1_000)
                                        .toFixed(duration % 1_000 === 0 ? 0 : 1)
                                        .replace(".", ",")} s pro Bild
                                    </option>
                                  ))}
                              </NativeSelect>
                            </div>
                          ) : null}

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

        <aside className="min-w-0">
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

            <div className="overflow-x-auto bg-muted/50 p-3 sm:p-5">
              {previewHtml ? (
                <div
                  className="mx-auto overflow-hidden rounded-md bg-white shadow-lg transition-[width] duration-200"
                  style={{
                    width: previewViewport === "mobile" ? 390 : 760,
                    maxWidth: "100%",
                  }}
                >
                  <iframe
                    ref={previewFrameRef}
                    title={`Newsletter-Vorschau – ${
                      previewViewport === "mobile" ? "Mobil" : "Desktop"
                    }`}
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin"
                    scrolling="no"
                    onLoad={handlePreviewFrameLoad}
                    className="block w-full border-0 bg-white"
                    style={{ height: previewHeight }}
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

      {isProjectLibraryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsProjectLibraryOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="showcase-library-title"
            aria-describedby="showcase-library-description"
            className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:max-h-[calc(100vh-3rem)]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div>
                <h2
                  id="showcase-library-title"
                  className="text-xl font-semibold text-foreground"
                >
                  Beitragsbibliothek
                </h2>
                <p
                  id="showcase-library-description"
                  className="mt-1 text-sm text-muted-foreground"
                >
                  Wähle Beiträge aus KongloDigital aus. Sie werden am Ende des
                  Newsletters eingefügt und anschließend dort bearbeitet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProjectLibraryOpen(false)}
                className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Beitragsbibliothek schließen"
              >
                Schließen
              </button>
            </header>

            <div className="border-b border-border bg-muted/30 px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field
                  label="Beiträge durchsuchen"
                  className="flex-1"
                  autoFocus
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
                  {query.trim()
                    ? "Alle Treffer hinzufügen"
                    : "Alle hinzufügen"}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {filteredShowcases.length}{" "}
                  {filteredShowcases.length === 1 ? "Beitrag" : "Beiträge"}
                  {query.trim() ? " gefunden" : " verfügbar"}
                </span>
                <span>
                  {selectedShowcaseCount} von {MAX_SELECTED_SHOWCASES} im Newsletter
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {filteredShowcases.length === 0 ? (
                <div className="rounded-lg border border-dashed border-input bg-muted/40 px-5 py-10 text-center text-sm text-muted-foreground">
                  Keine passenden Beiträge gefunden.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredShowcases.map((showcase) => {
                    const selected = selectedShowcaseIds.has(showcase.id);
                    const limitReached =
                      !selected &&
                      selectedShowcaseCount >= MAX_SELECTED_SHOWCASES;
                    const imageUrl = previewImage(
                      showcase.images[0] ?? null,
                      260,
                      180,
                    );
                    const description = stripText(
                      showcase.excerpt || showcase.description,
                    );

                    return (
                      <button
                        key={showcase.id}
                        type="button"
                        onClick={() => addShowcase(showcase)}
                        disabled={selected || limitReached}
                        aria-pressed={selected}
                        aria-label={
                          selected
                            ? `${showcase.name} ist bereits im Newsletter`
                            : `${showcase.name} zum Newsletter hinzufügen`
                        }
                        className={cn(
                          "group flex min-h-32 overflow-hidden rounded-lg border text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring/30",
                          selected
                            ? "border-primary bg-primary-soft"
                            : "border-border bg-card hover:border-input hover:shadow-md",
                          limitReached &&
                            "cursor-not-allowed opacity-55 hover:border-border hover:shadow-sm",
                        )}
                      >
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt=""
                            width={260}
                            height={180}
                            unoptimized
                            loading="lazy"
                            className="w-28 shrink-0 object-cover sm:w-36"
                          />
                        ) : (
                          <span className="flex w-28 shrink-0 items-center justify-center bg-muted px-2 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground sm:w-36">
                            Kein Bild
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col p-4">
                          <span className="flex items-start justify-between gap-3">
                            <span className="font-semibold leading-snug text-foreground">
                              {showcase.name}
                            </span>
                            <span
                              className={cn(
                                "inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                                selected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground group-hover:bg-primary-soft group-hover:text-primary",
                              )}
                            >
                              {selected
                                ? "Im Newsletter"
                                : limitReached
                                  ? "Limit erreicht"
                                  : "Hinzufügen"}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDate(showcase.publishDate ?? showcase.updatedAt)}
                          </span>
                          <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                            {description
                              ? `${description.slice(0, 150)}${
                                  description.length > 150 ? " …" : ""
                                }`
                              : "Noch keine Beschreibung hinterlegt."}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-muted-foreground">
                Maximal {MAX_SELECTED_SHOWCASES} Beiträge, damit Footer und
                Abmeldelink in E-Mail-Programmen sichtbar bleiben.
              </p>
              <Button
                type="button"
                kind="primary"
                onClick={() => setIsProjectLibraryOpen(false)}
              >
                Auswahl übernehmen
              </Button>
            </footer>
          </section>
        </div>
      ) : null}

      {imagePositionSession ? (
        <NewsletterImagePositionDialog
          imageUrl={imagePositionSession.imageUrl}
          imageLabel={imagePositionSession.imageLabel}
          aspectRatio={ASPECT_RATIO_VALUES[imagePositionSession.aspect]}
          aspectLabel={imagePositionSession.aspect}
          initialPosition={imagePositionSession.initialPosition}
          onApply={applyImagePosition}
          onClose={() => setImagePositionSession(null)}
        />
      ) : null}
    </div>
  );
}
