"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Reorder } from "motion/react";
import Select from "react-select";
import {
  faArrowLeft,
  faFilePdf,
  faFloppyDisk,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { ResourcePayload } from "@/lib/campai-resources";
import Button from "../components/Button";
import MdxEditorInput from "../components/MdxEditorInput";
import ImageCropDialog from "../components/ImageCropDialog";
import { localizePathname, RESOURCES_NAMESPACE } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { buildProjectPath } from "@/lib/project-path";
import { normalizeProjectLinks } from "@/lib/project-links";
import {
  getResourceMediaKindFromMimeType,
  getResourceMediaKindFromUrl,
  type ResourceMediaKind,
} from "@/lib/resource-media";
import { fetchJson, resizeImage } from "../resources/resource-form-utils";

type InitialProject = ResourcePayload & {
  createdAt?: string | null;
  updatedAt?: string | null;
};

type ResourceOption = {
  value: string;
  label: string;
  type?: string;
};

type ProjectFormValues = {
  title: string;
  description: string;
  tags: string;
  workshopResourceId: string;
  usedResourceIds: string[];
  socialMediaConsent: boolean;
  links: Array<{ label: string; url: string }>;
};

type ProjectEditorClientProps = {
  mode: "create" | "edit";
  initialProject?: InitialProject | null;
};

type ExistingProjectImageItem = {
  id: string;
  kind: "existing";
  mediaType: ResourceMediaKind;
  previewUrl: string;
  imageUrl: string;
  imageName: string;
};

type NewProjectImageItem = {
  id: string;
  kind: "new";
  mediaType: ResourceMediaKind;
  previewUrl: string;
  file: File;
};

type ProjectImageItem = ExistingProjectImageItem | NewProjectImageItem;

type ProjectCropSession = {
  itemId: string;
  sourceUrl: string;
  imageName: string;
  imageType: string;
  cleanupUrl?: string;
};

const normalizeTagValue = (value: string) => value.trim().replace(/^#+/, "");

const parseTagString = (value: string) =>
  value.split(",").map(normalizeTagValue).filter(Boolean);

const splitTagDraft = (value: string) =>
  value
    .split(/[\s,;\n\r\t]+/)
    .map(normalizeTagValue)
    .filter(Boolean);

const serializeTagList = (tags: string[]) => tags.join(", ");

const toTagString = (tags?: string[]) => serializeTagList(tags ?? []);

const normalizeImageList = (project?: InitialProject | null) => {
  if (!project) {
    return [] as string[];
  }

  if (Array.isArray(project.images) && project.images.length > 0) {
    return project.images.filter(
      (image): image is string => typeof image === "string",
    );
  }

  return project.image ? [project.image] : [];
};

const createProjectImageItemId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `project-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const getImageNameFromUrl = (imageUrl: string, fallbackIndex: number) => {
  try {
    const pathname = new URL(imageUrl).pathname;
    const segment = pathname.split("/").filter(Boolean).at(-1);
    if (segment) {
      return decodeURIComponent(segment);
    }
  } catch {
    const segment = imageUrl.split("/").filter(Boolean).at(-1);
    if (segment) {
      return segment;
    }
  }
  return `project-image-${fallbackIndex + 1}.jpg`;
};

const createExistingProjectImageItem = (
  imageUrl: string,
  index: number,
): ExistingProjectImageItem => ({
  id: createProjectImageItemId(),
  kind: "existing",
  mediaType: getResourceMediaKindFromUrl(imageUrl),
  previewUrl: imageUrl,
  imageUrl,
  imageName: getImageNameFromUrl(imageUrl, index),
});

const createNewProjectImageItem = (
  file: File,
  id = createProjectImageItemId(),
): NewProjectImageItem => ({
  id,
  kind: "new",
  mediaType: getResourceMediaKindFromMimeType(file.type),
  previewUrl: URL.createObjectURL(file),
  file,
});

const isNewProjectImageItem = (
  imageItem: ProjectImageItem,
): imageItem is NewProjectImageItem => imageItem.kind === "new";

export default function ProjectEditorClient({
  mode,
  initialProject,
}: ProjectEditorClientProps) {
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [imageItems, setImageItems] = useState<ProjectImageItem[]>(() =>
    normalizeImageList(initialProject).map((imageUrl, index) =>
      createExistingProjectImageItem(imageUrl, index),
    ),
  );
  const [cropSession, setCropSession] = useState<ProjectCropSession | null>(
    null,
  );
  const [cropLoadingId, setCropLoadingId] = useState<string | null>(null);
  const [resourceOptions, setResourceOptions] = useState<ResourceOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const newPreviewUrlsRef = useRef<string[]>([]);
  const cropCleanupUrlRef = useRef<string | null>(null);

  const { control, register, handleSubmit, setValue, watch } =
    useForm<ProjectFormValues>({
      defaultValues: {
        title: initialProject?.name ?? "",
        description: initialProject?.description ?? "",
        tags: toTagString(initialProject?.tags),
        workshopResourceId: initialProject?.workshopResource?.id ?? "",
        usedResourceIds:
          initialProject?.relatedResources
            ?.map((resource) => resource.id)
            .filter(Boolean) ?? [],
        socialMediaConsent: initialProject?.socialMediaConsent ?? false,
        links:
          initialProject?.projectLinks && initialProject.projectLinks.length > 0
            ? initialProject.projectLinks.map((link) => ({
                label: link.label,
                url: link.url,
              }))
            : [{ label: "", url: "" }],
      },
    });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "links",
  });

  const watchedWorkshopResourceId = watch("workshopResourceId");
  const watchedUsedResourceIds = watch("usedResourceIds");
  const watchedTags = watch("tags");
  const [tagDraft, setTagDraft] = useState("");

  const projectTags = useMemo(
    () => parseTagString(watchedTags ?? ""),
    [watchedTags],
  );

  const syncTags = (nextTags: string[]) => {
    setValue("tags", serializeTagList(nextTags), {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  const addTags = (rawValue: string) => {
    const nextTags = splitTagDraft(rawValue);
    if (nextTags.length === 0) {
      return;
    }

    const mergedTags = [...projectTags];
    nextTags.forEach((tag) => {
      if (!mergedTags.includes(tag)) {
        mergedTags.push(tag);
      }
    });

    syncTags(mergedTags);
    setTagDraft("");
  };

  const removeTag = (tagToRemove: string) => {
    syncTags(projectTags.filter((tag) => tag !== tagToRemove));
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      event.key === "Enter" ||
      event.key === "Tab" ||
      event.key === "," ||
      event.key === ";" ||
      event.key === " "
    ) {
      if (tagDraft.trim()) {
        event.preventDefault();
        addTags(tagDraft);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Backspace" && !tagDraft && projectTags.length > 0) {
      event.preventDefault();
      removeTag(projectTags[projectTags.length - 1]);
    }
  };

  const handleTagPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedText = event.clipboardData.getData("text");
    if (splitTagDraft(pastedText).length === 0) {
      return;
    }

    event.preventDefault();
    addTags(pastedText);
  };

  useEffect(() => {
    let active = true;

    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const data = await fetchJson<{ resources: ResourcePayload[] }>(
          "/api/campai/resources?limit=1500&offset=0",
        );
        if (!active) {
          return;
        }

        const options = (data.resources ?? [])
          .filter((resource) => resource.id)
          .map((resource) => ({
            value: resource.id,
            label: resource.name?.trim() || resource.id,
            type: resource.type?.trim().toLowerCase(),
          }));
        setResourceOptions(options);
      } catch {
        if (active) {
          setResourceOptions([]);
        }
      } finally {
        if (active) {
          setOptionsLoading(false);
        }
      }
    };

    loadOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nextPreviewUrls = imageItems
      .filter(isNewProjectImageItem)
      .map((imageItem) => imageItem.previewUrl);
    newPreviewUrlsRef.current
      .filter((previewUrl) => !nextPreviewUrls.includes(previewUrl))
      .forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    newPreviewUrlsRef.current = nextPreviewUrls;
  }, [imageItems]);

  useEffect(() => {
    return () => {
      newPreviewUrlsRef.current.forEach((previewUrl) =>
        URL.revokeObjectURL(previewUrl),
      );
    };
  }, []);

  useEffect(() => {
    const nextCleanupUrl = cropSession?.cleanupUrl ?? null;
    if (
      cropCleanupUrlRef.current &&
      cropCleanupUrlRef.current !== nextCleanupUrl
    ) {
      URL.revokeObjectURL(cropCleanupUrlRef.current);
    }
    cropCleanupUrlRef.current = nextCleanupUrl;
  }, [cropSession]);

  useEffect(() => {
    return () => {
      if (cropCleanupUrlRef.current) {
        URL.revokeObjectURL(cropCleanupUrlRef.current);
      }
    };
  }, []);

  const workshopOptions = useMemo(
    () => resourceOptions.filter((option) => option.type === "place"),
    [resourceOptions],
  );

  const usedResourceOptions = useMemo(
    () => resourceOptions.filter((option) => option.type !== "project"),
    [resourceOptions],
  );

  const selectedWorkshopOption = useMemo(
    () =>
      workshopOptions.find(
        (option) => option.value === watchedWorkshopResourceId,
      ) ?? null,
    [watchedWorkshopResourceId, workshopOptions],
  );

  const selectedUsedResourceOptions = useMemo(
    () =>
      (watchedUsedResourceIds ?? []).map(
        (resourceId) =>
          usedResourceOptions.find((option) => option.value === resourceId) ?? {
            value: resourceId,
            label: resourceId,
          },
      ),
    [usedResourceOptions, watchedUsedResourceIds],
  );

  const descriptionImageUrls = useMemo(
    () =>
      imageItems
        .filter(
          (imageItem): imageItem is ExistingProjectImageItem =>
            imageItem.kind === "existing" && imageItem.mediaType === "image",
        )
        .map((imageItem) => imageItem.imageUrl),
    [imageItems],
  );

  const handleAddImages = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const resized = await Promise.all(
      files.map((file) => resizeImage(file, 1800)),
    );
    setImageItems((previous) => [
      ...previous,
      ...resized.map((file) => createNewProjectImageItem(file)),
    ]);
    event.target.value = "";
  };

  const handleStartCrop = async (imageItem: ProjectImageItem) => {
    setFormError(null);

    if (imageItem.mediaType !== "image") {
      return;
    }

    if (imageItem.kind === "new") {
      setCropSession({
        itemId: imageItem.id,
        sourceUrl: imageItem.previewUrl,
        imageName: imageItem.file.name,
        imageType: imageItem.file.type || "image/jpeg",
      });
      return;
    }

    setCropLoadingId(imageItem.id);
    try {
      const response = await fetch(imageItem.imageUrl);
      if (!response.ok) {
        throw new Error(tx("Bild konnte nicht geladen werden.", "de"));
      }
      const blob = await response.blob();
      const sourceUrl = URL.createObjectURL(blob);
      setCropSession({
        itemId: imageItem.id,
        sourceUrl,
        cleanupUrl: sourceUrl,
        imageName: imageItem.imageName,
        imageType: blob.type || "image/jpeg",
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : tx("Bild konnte nicht geladen werden.", "de"),
      );
    } finally {
      setCropLoadingId((current) =>
        current === imageItem.id ? null : current,
      );
    }
  };

  const handleApplyCrop = async (croppedFile: File) => {
    const activeCropSession = cropSession;
    if (!activeCropSession) {
      return;
    }

    try {
      const resizedFile = await resizeImage(croppedFile, 1800);
      setImageItems((previous) =>
        previous.map((imageItem) =>
          imageItem.id === activeCropSession.itemId
            ? createNewProjectImageItem(resizedFile, imageItem.id)
            : imageItem,
        ),
      );
      setCropSession(null);
    } catch {
      setFormError(tx("Bild konnte nicht zugeschnitten werden.", "de"));
    }
  };

  const onSubmit = async (values: ProjectFormValues) => {
    setSaving(true);
    setFormError(null);
    setFormMessage(null);

    const normalizedTitle = values.title.trim();
    if (!normalizedTitle) {
      setSaving(false);
      setFormError(tx("Ein Titel ist erforderlich.", "de"));
      return;
    }

    const normalizedLinks = normalizeProjectLinks(values.links);
    const existingImages = imageItems
      .filter(
        (imageItem): imageItem is ExistingProjectImageItem =>
          imageItem.kind === "existing",
      )
      .map((imageItem) => imageItem.imageUrl);
    const newImageFiles = imageItems
      .filter(isNewProjectImageItem)
      .map((imageItem) => imageItem.file);
    const formData = new FormData();
    formData.append("name", normalizedTitle);
    formData.append("description", values.description);
    formData.append("type", "project");
    formData.append(
      "priority",
      values.tags
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .includes("projectofthemonth")
        ? "5"
        : "3",
    );
    formData.append("tags", values.tags);
    formData.append("relatedResourceIds", values.usedResourceIds.join(", "));
    formData.append("categories", "");
    formData.append("categoryIds", "");
    formData.append("attachable", "0");
    formData.append("workshopResourceId", values.workshopResourceId);
    formData.append("projectLinks", JSON.stringify(normalizedLinks));
    formData.append(
      "socialMediaConsent",
      values.socialMediaConsent ? "1" : "0",
    );
    formData.append("imageUrls", JSON.stringify(existingImages));
    newImageFiles.forEach((file) => formData.append("images", file));

    try {
      const response = await fetch(
        mode === "edit" && initialProject?.id
          ? `/api/campai/resources/${initialProject.id}`
          : "/api/campai/resources",
        {
          method: mode === "edit" ? "PUT" : "POST",
          body: formData,
        },
      );
      const data = (await response.json()) as {
        error?: string;
        resource?: ResourcePayload;
        id?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ?? tx("Projekt konnte nicht gespeichert werden.", "de"),
        );
      }

      const targetProject = data.resource
        ? data.resource
        : {
            id: data.id ?? initialProject?.id ?? "",
            prettyTitle: initialProject?.prettyTitle ?? null,
          };
      setFormMessage(
        mode === "edit"
          ? tx("Projekt aktualisiert.", "de")
          : tx("Projekt erstellt.", "de"),
      );
      router.push(localizePathname(buildProjectPath(targetProject), locale));
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : tx("Projekt konnte nicht gespeichert werden.", "de"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            {mode === "edit"
              ? tx("Projekt bearbeiten", "de")
              : tx("Neues Projekt", "de")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            {tx(
              "Lege ein Projekt mit Bildern, Markdown-Beschreibung, Werkstattbezug und verwendeten Ressourcen an.",
              "de",
            )}
          </p>
        </div>
        <Button
          href={localizePathname(
            initialProject ? buildProjectPath(initialProject) : "/projects",
            locale,
          )}
          kind="secondary"
          icon={faArrowLeft}
          className="px-4 py-2 text-xs"
        >
          {tx("Zurück", "de")}
        </Button>
      </header>

      {formError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {formError}
        </section>
      ) : null}
      {formMessage ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {formMessage}
        </section>
      ) : null}

      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]"
        onSubmit={handleSubmit(onSubmit)}
      >
        <section className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tx("Titel", "de")}
            </label>
            <input
              type="text"
              {...register("title", { required: true })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-950"
              placeholder={tx(
                "z. B. Modulares Regal für die Holzwerkstatt",
                "de",
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tx("Beschreibung", "de")}
            </label>
            <textarea {...register("description")} className="hidden" />
            <MdxEditorInput
              value={watch("description") ?? ""}
              onChange={(nextValue) => {
                setValue("description", nextValue, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true,
                });
              }}
              ariaLabel={tx("Projektbeschreibung", "de")}
              placeholder={tx(
                "## Idee\n\nBeschreibe hier Entstehung, Ziel, Materialien und Ergebnis des Projekts.",
                "de",
              )}
              availableImageUrls={descriptionImageUrls}
              embedButtonLabel={tx("Hochgeladenes Bild einbetten", "de")}
              emptyImageMessage={tx(
                "Bereits gespeicherte Bilder erscheinen hier zum Einbetten.",
                "de",
              )}
            />
            <p className="text-xs text-zinc-500">
              {tx(
                "Unterstutzt Uberschriften, Listen, Links, Hervorhebungen und eingebettete Bilder.",
                "de",
              )}
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {tx("Medien", "de")}
              </label>
              <p className="mt-1 text-xs text-zinc-500">
                {tx(
                  "Mehrere Bilder, Videos und PDFs sind möglich. Bestehende Medien kannst du einzeln entfernen.",
                  "de",
                )}
              </p>
            </div>
            <input
              type="file"
              accept="image/*,video/*,.pdf,application/pdf"
              multiple
              className="w-full rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm"
              onChange={(event) => {
                void handleAddImages(event);
              }}
            />

            {imageItems.length > 0 ? (
              <>
                <p className="text-xs text-zinc-500">
                  {tx(
                    "Ziehe Medien, um die Reihenfolge festzulegen. Das erste Medium wird als Titelmedium verwendet.",
                    "de",
                  )}
                </p>
                <Reorder.Group
                  axis="x"
                  values={imageItems}
                  onReorder={setImageItems}
                  layoutScroll
                  className="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1"
                >
                  {imageItems.map((imageItem, index) => (
                    <Reorder.Item
                      key={imageItem.id}
                      value={imageItem}
                      layout
                      whileDrag={{ scale: 1.03, zIndex: 20 }}
                      transition={{
                        type: "spring",
                        stiffness: 420,
                        damping: 32,
                      }}
                      className="flex w-44 shrink-0 cursor-grab flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-100 p-3 active:cursor-grabbing"
                    >
                      <div className="overflow-hidden rounded-xl bg-white">
                        {imageItem.mediaType === "video" ? (
                          <video
                            src={imageItem.previewUrl}
                            className="h-28 w-full bg-zinc-950 object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : imageItem.mediaType === "document" ? (
                          <div className="flex h-28 w-full flex-col items-center justify-center bg-rose-50 text-rose-700">
                            <FontAwesomeIcon
                              icon={faFilePdf}
                              className="h-8 w-8"
                            />
                            <span className="mt-2 text-xs font-semibold uppercase tracking-[0.16em]">
                              PDF
                            </span>
                          </div>
                        ) : (
                          <img
                            src={imageItem.previewUrl}
                            alt={`${watch("title") || tx("Projektmedium", "de")} ${index + 1}`}
                            className="h-28 w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-zinc-500">
                          {index === 0
                            ? tx("Titelmedium", "de")
                            : imageItem.mediaType === "video"
                              ? `${tx("Video", "de")} ${index + 1}`
                              : imageItem.mediaType === "document"
                                ? `PDF ${index + 1}`
                                : `${tx("Bild", "de")} ${index + 1}`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {imageItem.mediaType === "image" ? (
                            <Button
                              type="button"
                              kind="secondary"
                              className="px-3 py-1.5 text-[11px]"
                              disabled={cropLoadingId === imageItem.id}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={() => {
                                void handleStartCrop(imageItem);
                              }}
                            >
                              {cropLoadingId === imageItem.id
                                ? tx("Lädt…", "de")
                                : tx("Zuschneiden", "de")}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            kind="secondary"
                            className="px-3 py-1.5 text-[11px]"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => {
                              setImageItems((previous) =>
                                previous.filter(
                                  (currentImage) =>
                                    currentImage.id !== imageItem.id,
                                ),
                              );
                            }}
                          >
                            {tx("Entfernen", "de")}
                          </Button>
                        </div>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              </>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {tx("Links", "de")}
              </label>
              <Button
                type="button"
                kind="secondary"
                icon={faPlus}
                className="px-3 py-2 text-xs"
                onClick={() => append({ label: "", url: "" })}
              >
                {tx("Link hinzufügen", "de")}
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]"
                >
                  <input
                    type="text"
                    {...register(`links.${index}.label`)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder={tx("Linktitel", "de")}
                  />
                  <input
                    type="text"
                    {...register(`links.${index}.url`)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    placeholder="https://…"
                  />
                  <Button
                    type="button"
                    kind="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={() => {
                      if (fields.length === 1) {
                        setValue(`links.${index}.label`, "");
                        setValue(`links.${index}.url`, "");
                        return;
                      }
                      remove(index);
                    }}
                  >
                    {tx("Entfernen", "de")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-5 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tx("Werkstatt", "de")}
            </label>
            <Controller
              control={control}
              name="workshopResourceId"
              render={() => (
                <Select<ResourceOption, false>
                  options={workshopOptions}
                  value={selectedWorkshopOption}
                  isLoading={optionsLoading}
                  onChange={(value) =>
                    setValue("workshopResourceId", value?.value ?? "")
                  }
                  className="text-sm"
                  classNamePrefix="project-workshop-select"
                  placeholder={tx("Werkstatt auswählen", "de")}
                  isClearable
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tx("Verwendete Ressourcen", "de")}
            </label>
            <Controller
              control={control}
              name="usedResourceIds"
              render={() => (
                <Select<ResourceOption, true>
                  isMulti
                  options={usedResourceOptions}
                  value={selectedUsedResourceOptions}
                  isLoading={optionsLoading}
                  onChange={(value) =>
                    setValue(
                      "usedResourceIds",
                      value.map((entry) => entry.value),
                    )
                  }
                  className="text-sm"
                  classNamePrefix="project-resources-select"
                  placeholder={tx("Ressourcen suchen und auswählen", "de")}
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tx("Tags", "de")}
            </label>
            <input type="hidden" {...register("tags")} />
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 focus-within:border-zinc-400">
              <div className="flex flex-wrap items-center gap-2">
                {projectTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-800"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      className="text-zinc-500 transition hover:text-zinc-900"
                      aria-label={`${tx("Tag entfernen", "de")}: ${tag}`}
                      onClick={() => removeTag(tag)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTags(tagDraft)}
                  onPaste={handleTagPaste}
                  autoComplete="off"
                  className="min-w-[12rem] flex-1 border-0 bg-transparent py-1 text-sm text-zinc-950 outline-none"
                  placeholder={tx(
                    "z. B. cnc, ausstellung, projectofthemonth",
                    "de",
                  )}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              {tx("Mit Enter, Komma oder Leerzeichen trennen.", "de")}
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              {...register("socialMediaConsent")}
              className="mt-1 h-4 w-4 rounded border-zinc-300"
            />
            <span>
              {tx(
                "Darf für Social Media auf den Accounts des Konglomerat e.V. verwendet werden.",
                "de",
              )}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="submit"
              kind="primary"
              size="medium"
              icon={mode === "edit" ? faFloppyDisk : faPlus}
              disabled={saving}
            >
              {saving
                ? tx("Speichert…", "de")
                : mode === "edit"
                  ? tx("Projekt speichern", "de")
                  : tx("Projekt erstellen", "de")}
            </Button>
          </div>
        </section>
      </form>

      {cropSession ? (
        <ImageCropDialog
          imageUrl={cropSession.sourceUrl}
          imageName={cropSession.imageName}
          imageType={cropSession.imageType}
          onClose={() => setCropSession(null)}
          onApply={handleApplyCrop}
        />
      ) : null}
    </main>
  );
}
