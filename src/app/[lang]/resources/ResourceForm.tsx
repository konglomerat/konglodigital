"use client";
/* eslint-disable @next/next/no-img-element */

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { useMemo, useState } from "react";
import type {
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from "react-hook-form";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Reorder } from "motion/react";

import Button from "../components/Button";
import MdxEditorInput from "../components/MdxEditorInput";
import ReactSelect from "../components/ui/react-select";
import ResourceMapCrosshair from "./ResourceMapCrosshair";
import { RESOURCE_TYPES, type ResourceType } from "./resource-types";
import { useI18n } from "@/i18n/client";
import { RESOURCES_NAMESPACE } from "@/i18n/config";
import {
  getImageGps,
  resizeImage,
  type ImageGps,
  type ResourceFormValues,
} from "./resource-form-utils";
import {
  getResourceMediaKindFromMimeType,
  getResourceMediaKindFromUrl,
  type ResourceMediaKind,
} from "@/lib/resource-media";

type ResourceFormTheme = "dark" | "light";

export type RelatedResourceSelectOption = {
  value: string;
  label: string;
  resourceType?: ResourceType | string;
};

type ResourceFormProps = {
  register: UseFormRegister<ResourceFormValues>;
  watch: UseFormWatch<ResourceFormValues>;
  setValue: UseFormSetValue<ResourceFormValues>;
  setImageFiles: Dispatch<SetStateAction<File[]>>;
  setImageFileMeta: Dispatch<SetStateAction<Array<ImageGps | null>>>;
  imagePreviews: string[];
  mediaKinds?: ResourceMediaKind[];
  imageMeta?: Array<ImageGps | null>;
  onRemoveImage: (index: number) => void;
  onReorderImages: (order: number[]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  submitLabel: string;
  submitIcon?: IconProp;
  requireName?: boolean;
  theme?: ResourceFormTheme;
  fileLabel?: string;
  fileSubLabel?: string;
  fileHelpText?: string;
  maxImageWidth?: number;
  gpsLocation?: ImageGps | null;
  onGpsChange?: (gps: ImageGps) => void;
  gpsSuggested?: boolean;
  descriptionAvailableImageUrls?: string[];
  relatedResourceOptions: RelatedResourceSelectOption[];
  relatedResourceLoading?: boolean;
  showSubmitButton?: boolean;
  priorityInput?: "select" | "stars";
  onImageProcessingChange?: (isProcessing: boolean) => void;
};

const styles = {
  light: {
    label:
      "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
    input:
      "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80",
    select:
      "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground",
    textarea:
      "min-h-[90px] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80",
    fileInput:
      "w-full cursor-pointer rounded-md border-2 border-dashed border-primary bg-accent px-4 py-6 text-sm font-medium text-primary file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground hover:border-primary hover:bg-foreground/8 focus:outline-none focus:ring-2 focus:ring-ring/40",
    fileHelp: "text-xs text-muted-foreground",
    checkbox: "h-4 w-4 rounded-md border-input",
  },
  dark: {
    label:
      "text-xs font-semibold uppercase tracking-wide text-muted-foreground",
    input:
      "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80",
    select:
      "rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground",
    textarea:
      "min-h-[90px] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80",
    fileInput:
      "w-full cursor-pointer rounded-md border-2 border-dashed border-primary bg-accent px-4 py-6 text-sm font-medium text-primary file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground hover:border-primary hover:bg-foreground/8 focus:outline-none focus:ring-2 focus:ring-ring/40",
    fileHelp: "text-xs text-muted-foreground",
    checkbox: "h-4 w-4 rounded-md border-input",
  },
};

export default function ResourceForm({
  register,
  watch,
  setValue,
  setImageFiles,
  setImageFileMeta,
  imagePreviews,
  mediaKinds,
  onRemoveImage,
  onReorderImages,
  onSubmit,
  saving,
  submitLabel,
  submitIcon,
  requireName = true,
  theme = "light",
  fileLabel = "Files",
  fileSubLabel,
  fileHelpText,
  maxImageWidth,
  gpsLocation,
  onGpsChange,
  gpsSuggested = false,
  descriptionAvailableImageUrls,
  relatedResourceOptions,
  relatedResourceLoading = false,
  showSubmitButton = true,
  priorityInput = "select",
  onImageProcessingChange,
}: ResourceFormProps) {
  const { tx } = useI18n(RESOURCES_NAMESPACE);
  const themeStyles = styles[theme];
  const helpText =
    fileHelpText ??
    tx(
      "Choose one or more images, videos or PDFs (JPG/PNG/WebP/MP4/PDF).",
      "en",
    );
  const resizeWidth = maxImageWidth ?? 2000;
  const selectedRelatedResourceIds = watch("relatedResourceIds") ?? "";
  const selectedPriority = watch("priority") ?? "3";
  const [previewOrder, setPreviewOrder] = useState<number[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);

  const relatedResourceValue = useMemo(() => {
    const idList = selectedRelatedResourceIds
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const optionById = new Map(
      relatedResourceOptions.map((option) => [option.value, option]),
    );
    return idList.map((id) => optionById.get(id) ?? { value: id, label: id });
  }, [relatedResourceOptions, selectedRelatedResourceIds]);

  const effectivePreviewOrder = useMemo(() => {
    const defaultOrder = imagePreviews.map((_, index) => index);
    if (previewOrder.length !== imagePreviews.length) {
      return defaultOrder;
    }
    const unique = new Set(previewOrder);
    if (unique.size !== previewOrder.length) {
      return defaultOrder;
    }
    const isValid = previewOrder.every(
      (index) => index >= 0 && index < imagePreviews.length,
    );
    if (!isValid) {
      return defaultOrder;
    }
    return previewOrder;
  }, [imagePreviews, previewOrder]);

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2">
        <label className={themeStyles.label}>{tx("Name")}</label>
        <input
          type="text"
          {...register("name", {
            required: requireName ? tx("Name is required.") : false,
          })}
          className={themeStyles.input}
          placeholder={tx("Resource name")}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className={themeStyles.label}>{tx("Type")}</label>
        <select
          {...register("type", { required: tx("Type is required.") })}
          className={themeStyles.select}
        >
          {Object.entries(RESOURCE_TYPES).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className={themeStyles.label}>{tx("Priority")}</label>
        {priorityInput === "stars" ? (
          <>
            <input
              type="hidden"
              {...register("priority", {
                required: tx("Priority is required."),
              })}
            />
            <div
              className="flex items-center gap-1"
              role="radiogroup"
              aria-label={tx("Priority")}
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const active = Number(selectedPriority) >= value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={Number(selectedPriority) === value}
                    aria-label={`${tx("Set priority to")} ${value}`}
                    onClick={() => {
                      setValue("priority", String(value), {
                        shouldDirty: true,
                        shouldTouch: true,
                        shouldValidate: true,
                      });
                    }}
                    className={`h-8 w-8 rounded-md border text-lg leading-none transition ${
                      active
                        ? "border-warning-border bg-warning-soft text-warning"
                        : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground"
                    }`}
                  >
                    ★
                  </button>
                );
              })}
            </div>
            <p className={themeStyles.fileHelp}>
              {tx("Selected")}: {selectedPriority}/5
            </p>
          </>
        ) : (
          <select
            {...register("priority", {
              required: tx("Priority is required."),
            })}
            className={themeStyles.select}
          >
            <option value="1">{tx("1 (Lowest)")}</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">{tx("5 (Highest)")}</option>
          </select>
        )}
      </div>

      <div className="flex flex-col gap-2 md:col-span-2">
        <label className={themeStyles.label}>{tx("Description")}</label>
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
          ariaLabel={tx("Description")}
          placeholder={tx("Optional description")}
          availableImageUrls={descriptionAvailableImageUrls}
          embedButtonLabel={tx("Embed uploaded image", "en")}
          emptyImageMessage={tx(
            "Uploaded images become available here after they have been saved.",
            "en",
          )}
        />
      </div>

      <div className="flex flex-col gap-2 md:col-span-2">
        <label className={themeStyles.label}>{tx("Tags")}</label>
        <input
          type="text"
          {...register("tags")}
          className={themeStyles.input}
          placeholder={tx("tag1, tag2")}
        />
      </div>

      <div className="flex flex-col gap-2 md:col-span-2">
        <label className={themeStyles.label}>{tx("Related resources")}</label>
        <input type="hidden" {...register("relatedResourceIds")} />
        <ReactSelect<RelatedResourceSelectOption, true>
          isMulti
          options={relatedResourceOptions}
          value={relatedResourceValue}
          isLoading={relatedResourceLoading}
          formatOptionLabel={(option) => {
            const typeConfig = option.resourceType
              ? RESOURCE_TYPES[
                  option.resourceType as keyof typeof RESOURCE_TYPES
                ]
              : undefined;
            return (
              <span className="inline-flex items-center gap-2">
                {typeConfig ? (
                  <FontAwesomeIcon
                    icon={typeConfig.icon}
                    className={typeConfig.color}
                  />
                ) : null}
                <span>{option.label}</span>
              </span>
            );
          }}
          onChange={(value) => {
            const ids = value.map((entry) => entry.value).join(", ");
            setValue("relatedResourceIds", ids, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            });
          }}
          className="text-sm"
          classNamePrefix="resource-related-select"
          placeholder={tx("Search and select related resources")}
          noOptionsMessage={() => tx("No resources found")}
        />
        <p className={themeStyles.fileHelp}>
          {tx("Search by name and select one or more related resources.", "en")}
        </p>
      </div>

      {onGpsChange ? (
        <div className="flex flex-col gap-2 md:col-span-2">
          <label className={themeStyles.label}>{tx("Location")}</label>
          <div className="overflow-hidden rounded-xl border border-border/60">
            <ResourceMapCrosshair
              gps={gpsLocation}
              onChange={onGpsChange}
              className="w-full aspect-[4/3]"
            />
          </div>
          {gpsSuggested ? (
            <p className={themeStyles.fileHelp}>
              {tx(
                "We detected a location from the image. Please confirm or adjust it on the map.",
                "en",
              )}
            </p>
          ) : null}
          <p className={themeStyles.fileHelp}>
            {tx("Drag the marker or click the map to set the location.")}
          </p>
        </div>
      ) : null}

      {/* <div className="flex flex-col gap-2">
        <label className={themeStyles.label}>Categories</label>
        <input
          type="text"
          {...register("categories")}
          className={themeStyles.input}
          placeholder="category1, category2"
        />
      </div> */}

      {/* <div className="flex flex-col gap-2">
        <label className={themeStyles.label}>Category IDs</label>
        <input
          type="text"
          {...register("categoryIds")}
          className={themeStyles.input}
          placeholder="id1, id2"
        />
      </div> */}

      <div className="flex flex-col gap-2 md:col-span-2">
        <div className="flex items-center justify-between">
          <label className={themeStyles.label}>{fileLabel}</label>
          {fileSubLabel ? (
            <span className="text-xs font-medium text-muted-foreground/80">
              {fileSubLabel}
            </span>
          ) : null}
        </div>
        <input
          type="file"
          accept="image/*,video/*,.pdf,application/pdf"
          multiple
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            console.log("ResourceForm: files selected", files);
            if (files.length === 0) {
              return;
            }
            const containsImages = files.some(
              (file) => getResourceMediaKindFromMimeType(file.type) === "image",
            );
            if (!containsImages) {
              setImageFiles((previous) => [...previous, ...files]);
              setImageFileMeta((previous) => [
                ...previous,
                ...files.map(() => null),
              ]);
              event.target.value = "";
              return;
            }
            setIsProcessingImages(true);
            onImageProcessingChange?.(true);
            try {
              const resized = await Promise.all(
                files.map((file) => resizeImage(file, resizeWidth)),
              );
              const gpsMeta = await Promise.all(
                files.map((file) => getImageGps(file)),
              );
              console.log("ResourceForm: gpsMeta extracted", gpsMeta);
              setImageFiles((previous) => [...previous, ...resized]);
              setImageFileMeta((previous) => [...previous, ...gpsMeta]);
            } finally {
              setIsProcessingImages(false);
              onImageProcessingChange?.(false);
              event.target.value = "";
            }
          }}
          disabled={isProcessingImages}
          className={themeStyles.fileInput}
        />
        {isProcessingImages ? (
          <p className={themeStyles.fileHelp}>
            {tx("Loading image location data...")}
          </p>
        ) : null}
        {fileHelpText ? (
          <p className={themeStyles.fileHelp}>{helpText}</p>
        ) : null}
        {imagePreviews.length > 0 ? (
          <Reorder.Group
            axis="x"
            values={effectivePreviewOrder}
            onReorder={(nextOrder) => {
              setPreviewOrder(nextOrder);
            }}
            layoutScroll
            className="mt-2 flex items-center gap-3 overflow-x-auto pb-2 p-4"
          >
            {effectivePreviewOrder
              .filter(
                (previewIndex) =>
                  previewIndex >= 0 && previewIndex < imagePreviews.length,
              )
              .map((previewIndex, renderIndex) => {
                const preview = imagePreviews[previewIndex];
                const mediaKind =
                  mediaKinds?.[previewIndex] ??
                  getResourceMediaKindFromUrl(preview);
                return (
                  <Reorder.Item
                    key={`${preview}-${previewIndex}`}
                    value={previewIndex}
                    layout
                    whileDrag={{ scale: 1.03, zIndex: 20 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    onDragEnd={() => {
                      const order = effectivePreviewOrder;
                      if (order.length !== imagePreviews.length) {
                        return;
                      }
                      const isChanged = order.some(
                        (previewOrderIndex, index) =>
                          previewOrderIndex !== index,
                      );
                      if (isChanged) {
                        onReorderImages(order);
                      }
                    }}
                    className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card relative"
                  >
                    {mediaKind === "document" ? (
                      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-destructive-soft text-destructive">
                        <FontAwesomeIcon icon={faFilePdf} className="h-6 w-6" />
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                          PDF
                        </span>
                      </div>
                    ) : (
                      mediaKind === "video" ? (
                        <video
                          src={preview}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="h-16 w-16 rounded-xl bg-foreground object-cover"
                        />
                      ) : (
                        <img
                          src={preview}
                          alt={`Preview ${renderIndex + 1}`}
                          draggable={false}
                          onDragStart={(event) => event.preventDefault()}
                          className="h-16 w-16 rounded-xl object-cover"
                        />
                      )
                    )}

                    <button
                      type="button"
                      onClick={() => onRemoveImage(previewIndex)}
                      className="rounded-full bg-card w-6 h-6 text-[10px] font-semibold text-muted-foreground shadow absolute top-[-5px] right-[-5px] transition hover:bg-accent group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </Reorder.Item>
                );
              })}
          </Reorder.Group>
        ) : null}
      </div>

      {showSubmitButton ? (
        <div className="md:col-span-2">
          <p className="mb-3 text-sm text-muted-foreground">
            {tx(
              "Bitte stelle sicher, dass alle Rechte am Material hast. Danke!",
              "de",
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              kind="primary"
              size="large"
              icon={submitIcon}
              disabled={saving || isProcessingImages}
            >
              {isProcessingImages
                ? tx("Loading location data...")
                : saving
                  ? tx("Saving...")
                  : submitLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
