"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faArrowLeft, faPlus } from "@fortawesome/free-solid-svg-icons";

import Button from "../components/Button";
import ResourceForm from "./ResourceForm";
import {
  createResourceFormData,
  fetchJson,
  getCategoryError,
  type ImageGps,
  type Resource,
  type ResourceFormValues,
} from "./resource-form-utils";
import type { RelatedResourceSelectOption } from "./ResourceForm";
import { buildResourcePath } from "@/lib/resource-pretty-title";
import { useI18n } from "@/i18n/client";
import { localizePathname, RESOURCES_NAMESPACE } from "@/i18n/config";
import {
  getResourceMediaKindFromMimeType,
  getResourceMediaKindFromUrl,
} from "@/lib/resource-media";

type ModeConfig = {
  title: string;
  subtitle: string;
  submitLabel: string;
  submitIcon: IconProp;
  theme: "dark" | "light";
  fileHelpText?: string;
  maxImageWidth: number;
  headerLinks: Array<{ href: string; label: string; icon?: IconProp }>;
};

const config: ModeConfig = {
  title: "Create resource",
  subtitle: "Add a new resource to the inventory.",
  submitLabel: "Create resource",
  submitIcon: faPlus,
  theme: "dark",
  fileHelpText: "Choose one or more images or PDFs (JPG/PNG/WebP/PDF).",
  maxImageWidth: 2000,
  headerLinks: [
    {
      href: "/resources",
      label: "Back to resources",
      icon: faArrowLeft,
    },
  ],
};

type RelatedResourceOptionCandidate = {
  value: string;
  baseLabel: string;
  resourceType?: string;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const getDistanceMeters = (
  from: ImageGps,
  to: { gpsLatitude?: number | null; gpsLongitude?: number | null },
) => {
  if (
    !Number.isFinite(to.gpsLatitude) ||
    !Number.isFinite(to.gpsLongitude) ||
    to.gpsLatitude == null ||
    to.gpsLongitude == null
  ) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(to.gpsLatitude - from.latitude);
  const deltaLon = toRadians(to.gpsLongitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.gpsLatitude);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return Math.round(earthRadiusMeters * arc);
};

const formatMeters = (meters: number) => `${meters.toLocaleString("de-DE")} m`;

export default function ResourceEditorPage({}: Record<string, never>) {
  const { tx, locale } = useI18n(RESOURCES_NAMESPACE);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageFileMeta, setImageFileMeta] = useState<Array<ImageGps | null>>(
    [],
  );
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [location, setLocation] = useState<ImageGps | null>(null);
  const [relatedResourceOptionsRaw, setRelatedResourceOptionsRaw] = useState<
    RelatedResourceOptionCandidate[]
  >([]);
  const [relatedResourceOptionsLoading, setRelatedResourceOptionsLoading] =
    useState(false);
  const { register, handleSubmit, setValue, watch } =
    useForm<ResourceFormValues>({
      defaultValues: {
        name: "",
        description: "",
        type: "tool",
        priority: "3",
        tags: "",
        relatedResourceIds: "",
        categories: "",
        categoryIds: "",
        attachable: false,
      },
    });

  useEffect(() => {
    let active = true;
    const loadRelatedResourceOptions = async () => {
      setRelatedResourceOptionsLoading(true);
      try {
        const data = await fetchJson<{ resources: Resource[] }>(
          "/api/campai/resources?limit=1500&offset=0",
        );
        if (!active) {
          return;
        }
        const options = (data.resources ?? [])
          .filter((resource) => resource.id)
          .map((resource) => ({
            value: resource.id,
            baseLabel: resource.name?.trim() || resource.id,
            resourceType: resource.type?.trim().toLowerCase(),
            gpsLatitude: resource.gpsLatitude,
            gpsLongitude: resource.gpsLongitude,
          }));
        setRelatedResourceOptionsRaw(options);
      } catch {
        if (active) {
          setRelatedResourceOptionsRaw([]);
        }
      } finally {
        if (active) {
          setRelatedResourceOptionsLoading(false);
        }
      }
    };

    loadRelatedResourceOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    console.log("ResourceEditorPage: imageFileMeta", imageFileMeta);
    const firstGps = imageFileMeta.find((entry): entry is ImageGps =>
      Boolean(entry),
    );
    if (firstGps) {
      console.log("ResourceEditorPage: applying GPS", firstGps);
      setLocation(firstGps);
    } else {
      console.log("ResourceEditorPage: no GPS found in images");
    }
  }, [imageFileMeta]);

  useEffect(() => {
    if (imageFiles.length === 0) {
      setImagePreviews(existingImages);
      return;
    }

    const previews = imageFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews([...existingImages, ...previews]);
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [imageFiles, existingImages]);

  const onSubmit = async (data: ResourceFormValues) => {
    setSaving(true);
    setFormMessage(null);
    setFormError(null);

    const name = data.name.trim();
    const type = data.type.trim();
    if (!name && imageFiles.length === 0) {
      setSaving(false);
      setFormError(tx("Name is required unless a file is provided.", "en"));
      return;
    }
    if (!type) {
      setSaving(false);
      setFormError(tx("Type is required."));
      return;
    }
    const categoryError = getCategoryError(data.categories, data.categoryIds);
    if (categoryError) {
      setSaving(false);
      setFormError(categoryError);
      return;
    }

    const formData = createResourceFormData({
      formValues: data,
      imageFiles,
      maxImageWidth: config.maxImageWidth,
    });

    try {
      const data = await fetchJson<{
        resource?: Resource & { prettyTitle?: string | null };
        id?: string;
      }>("/api/campai/resources", {
        method: "POST",
        body: formData,
      });
      setFormMessage(tx("Resource created."));
      if (data.id) {
        router.push(
          localizePathname(
            buildResourcePath({
              id: data.id,
              prettyTitle: data.resource?.prettyTitle,
            }),
            locale,
          ),
        );
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : tx("Unable to save resource."),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    if (index < existingImages.length) {
      setExistingImages((prev) => prev.filter((_, idx) => idx !== index));
    } else {
      const fileIndex = index - existingImages.length;
      setImageFiles((prev) => prev.filter((_, idx) => idx !== fileIndex));
      setImageFileMeta((prev) => prev.filter((_, idx) => idx !== fileIndex));
    }
  };

  const handleReorderImages = (order: number[]) => {
    const totalImages = existingImages.length + imageFiles.length;
    if (totalImages <= 1 || order.length !== totalImages) {
      return;
    }
    if (new Set(order).size !== totalImages) {
      return;
    }
    type OrderedImage =
      | { kind: "existing"; url: string }
      | { kind: "new"; file: File; meta: ImageGps | null };

    const orderedImages: OrderedImage[] = [
      ...existingImages.map((url) => ({ kind: "existing" as const, url })),
      ...imageFiles.map((file, fileIndex) => ({
        kind: "new" as const,
        file,
        meta: imageFileMeta[fileIndex] ?? null,
      })),
    ];
    const reordered = order.map((index) => orderedImages[index]);
    const nextExistingImages = reordered
      .filter((entry) => entry.kind === "existing")
      .map((entry) => entry.url);
    const nextNewImages = reordered.filter(
      (entry): entry is Extract<OrderedImage, { kind: "new" }> =>
        entry.kind === "new",
    );

    setExistingImages(nextExistingImages);
    setImageFiles(nextNewImages.map((entry) => entry.file));
    setImageFileMeta(nextNewImages.map((entry) => entry.meta));
  };

  const imageMeta = useMemo(
    () => [...existingImages.map(() => null), ...imageFileMeta],
    [existingImages, imageFileMeta],
  );

  const mediaKinds = useMemo(
    () => [
      ...existingImages.map((url) => getResourceMediaKindFromUrl(url)),
      ...imageFiles.map((file) => getResourceMediaKindFromMimeType(file.type)),
    ],
    [existingImages, imageFiles],
  );

  const relatedResourceOptions = useMemo<RelatedResourceSelectOption[]>(() => {
    const hasLocation =
      location &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude);

    const withDistance = relatedResourceOptionsRaw.map((option) => {
      const distanceMeters = hasLocation
        ? getDistanceMeters(location, option)
        : null;
      return {
        option,
        distanceMeters,
      };
    });

    withDistance.sort((left, right) => {
      const leftDistance = left.distanceMeters;
      const rightDistance = right.distanceMeters;

      if (leftDistance != null && rightDistance != null) {
        return (
          leftDistance - rightDistance ||
          left.option.baseLabel.localeCompare(right.option.baseLabel)
        );
      }
      if (leftDistance != null) {
        return -1;
      }
      if (rightDistance != null) {
        return 1;
      }
      return left.option.baseLabel.localeCompare(right.option.baseLabel);
    });

    return withDistance.map(({ option, distanceMeters }) => ({
      value: option.value,
      resourceType: option.resourceType,
      label:
        distanceMeters != null
          ? `${option.baseLabel} (${formatMeters(distanceMeters)})`
          : option.baseLabel,
    }));
  }, [location, relatedResourceOptionsRaw]);

  return (
    <div>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {tx(config.title)}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{tx(config.subtitle)}</p>
          </div>
          <div className="flex items-center gap-2">
            {config.headerLinks.map((link) => (
              <Button
                key={link.href}
                href={localizePathname(link.href, locale)}
                kind="secondary"
                className="px-4 py-2 text-xs"
                icon={link.icon}
              >
                {tx(link.label)}
              </Button>
            ))}
          </div>
        </header>

        {formError ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {formError}
          </section>
        ) : null}
        {formMessage ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {formMessage}
          </section>
        ) : null}

        <section>
          <ResourceForm
            register={register}
            watch={watch}
            setValue={setValue}
            setImageFiles={setImageFiles}
            setImageFileMeta={setImageFileMeta}
            imagePreviews={imagePreviews}
            mediaKinds={mediaKinds}
            imageMeta={imageMeta}
            onRemoveImage={handleRemoveImage}
            onReorderImages={handleReorderImages}
            onSubmit={handleSubmit(onSubmit)}
            saving={saving}
            submitLabel={tx(config.submitLabel)}
            submitIcon={config.submitIcon}
            requireName={imageFiles.length === 0}
            theme={config.theme}
            fileLabel={tx("Files", "en")}
            descriptionAvailableImageUrls={existingImages}
            fileHelpText={
              config.fileHelpText ? tx(config.fileHelpText) : undefined
            }
            maxImageWidth={config.maxImageWidth}
            relatedResourceOptions={relatedResourceOptions}
            relatedResourceLoading={relatedResourceOptionsLoading}
          />
        </section>
      </main>
    </div>
  );
}
