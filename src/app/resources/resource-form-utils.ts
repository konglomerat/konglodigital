import imageCompression from "browser-image-compression";
import ExifReader from "exifreader";

export type ResourceCategory = {
  name?: string;
  bookingCategoryId?: string;
};

export type RelatedResource = {
  id: string;
  name?: string;
};

export type Resource = {
  id: string;
  name: string;
  description?: string;
  image?: string | null;
  images?: string[] | null;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsAltitude?: number | null;
  type?: string;
  priority?: number | null;
  attachable?: boolean;
  tags?: string[];
  categories?: ResourceCategory[];
  relatedResources?: RelatedResource[];
};

export type ResourceFormValues = {
  name: string;
  description: string;
  type: string;
  priority: string;
  tags: string;
  relatedResourceIds: string;
  categories: string;
  categoryIds: string;
  attachable: boolean;
};

export type ImageGps = {
  latitude: number;
  longitude: number;
};

export const fetchJson = async <T>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const data = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
};

export const resizeImage = async (file: File, maxWidth = 1000) => {
  if (!file.type.startsWith("image/")) {
    return file;
  }
  const imageBitmap = await createImageBitmap(file);
  const shouldResize = imageBitmap.width > maxWidth;
  imageBitmap.close();
  if (!shouldResize) {
    return file;
  }
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: maxWidth,
    useWebWorker: true,
    fileType: file.type,
    preserveExif: true,
  });
  return compressed;
};

const parseGpsCoordinate = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }
  const toNumber = (entry: unknown) => {
    if (typeof entry === "number") {
      return entry;
    }
    if (
      entry &&
      typeof entry === "object" &&
      "numerator" in entry &&
      "denominator" in entry
    ) {
      const numerator = Number((entry as { numerator: number }).numerator);
      const denominator = Number(
        (entry as { denominator: number }).denominator,
      );
      return denominator ? numerator / denominator : numerator;
    }
    const parsed = Number(entry);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const degrees = toNumber(value[0]);
  const minutes = toNumber(value[1]);
  const seconds = toNumber(value[2]);
  if (
    degrees === null ||
    minutes === null ||
    seconds === null ||
    [degrees, minutes, seconds].some((entry) => Number.isNaN(entry))
  ) {
    return null;
  }
  return degrees + minutes / 60 + seconds / 3600;
};

const getTagValue = (tag: unknown) => {
  if (tag && typeof tag === "object") {
    if ("value" in tag) {
      return (tag as { value: unknown }).value;
    }
    if ("description" in tag) {
      return (tag as { description: unknown }).description;
    }
  }
  return null;
};

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getImageGps = async (file: File) => {
  if (!file.type.startsWith("image/")) {
    return null;
  }
  try {
    const buffer = await file.arrayBuffer();
    const tags = ExifReader.load(buffer, {
      includeTags: { gps: true },
      excludeTags: { xmp: true },
      computed: true,
      expanded: true,
    });
    const tagRecord =
      tags && typeof tags === "object" ? (tags as Record<string, unknown>) : {};
    const gpsGroup =
      (tagRecord as { gps?: Record<string, unknown> }).gps ?? undefined;
    const groupLatitude = gpsGroup ? toFiniteNumber(gpsGroup.Latitude) : null;
    const groupLongitude = gpsGroup ? toFiniteNumber(gpsGroup.Longitude) : null;
    if (groupLatitude !== null && groupLongitude !== null) {
      return {
        latitude: groupLatitude,
        longitude: groupLongitude,
      } satisfies ImageGps;
    }

    const latitudeValue = getTagValue(tagRecord.GPSLatitude);
    const longitudeValue = getTagValue(tagRecord.GPSLongitude);
    const latitudeRef = getTagValue(tagRecord.GPSLatitudeRef);
    const longitudeRef = getTagValue(tagRecord.GPSLongitudeRef);

    const latitude = parseGpsCoordinate(latitudeValue);
    const longitude = parseGpsCoordinate(longitudeValue);
    if (latitude === null || longitude === null) {
      return null;
    }

    const latRef =
      typeof latitudeRef === "string" ? latitudeRef.toUpperCase() : "N";
    const lonRef =
      typeof longitudeRef === "string" ? longitudeRef.toUpperCase() : "E";
    const signedLatitude = latRef === "S" ? -latitude : latitude;
    const signedLongitude = lonRef === "W" ? -longitude : longitude;

    return {
      latitude: signedLatitude,
      longitude: signedLongitude,
    } satisfies ImageGps;
  } catch {
    return null;
  }
};

export const formatGps = (gps?: ImageGps | null) => {
  if (!gps) {
    return "-";
  }
  const latRef = gps.latitude >= 0 ? "N" : "S";
  const lonRef = gps.longitude >= 0 ? "E" : "W";
  const lat = Math.abs(gps.latitude).toFixed(6);
  const lon = Math.abs(gps.longitude).toFixed(6);
  return `${latRef} ${lat}, ${lonRef} ${lon}`;
};

const parseCommaList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const getCategoryError = (categories: string, categoryIds: string) => {
  if (!categories.trim()) {
    return null;
  }
  const categoryList = parseCommaList(categories);
  const categoryIdList = parseCommaList(categoryIds);
  if (categoryIdList.length !== categoryList.length) {
    return "Provide a category ID for each category.";
  }
  return null;
};

export const createResourceFormData = ({
  formValues,
  imageFiles,
  existingImages,
  maxImageWidth,
}: {
  formValues: ResourceFormValues;
  imageFiles: File[];
  existingImages?: string[];
  maxImageWidth?: number;
}) => {
  const formData = new FormData();
  formData.append("name", formValues.name.trim());
  formData.append("description", formValues.description.trim());
  formData.append("type", formValues.type.trim());
  formData.append("priority", formValues.priority);
  formData.append("tags", formValues.tags.trim());
  formData.append("relatedResourceIds", formValues.relatedResourceIds.trim());
  formData.append("categories", formValues.categories.trim());
  formData.append("categoryIds", formValues.categoryIds.trim());
  formData.append("attachable", formValues.attachable ? "1" : "0");
  if (typeof maxImageWidth === "number" && Number.isFinite(maxImageWidth)) {
    formData.append("maxImageWidth", String(Math.round(maxImageWidth)));
  }
  if (imageFiles.length > 0) {
    imageFiles.forEach((file) => formData.append("images", file));
  }
  if (existingImages) {
    formData.append("imageUrls", JSON.stringify(existingImages));
  }
  return formData;
};

export const getResourceFormValues = (
  resource: Resource,
): ResourceFormValues => ({
  name: resource.name ?? "",
  description: resource.description ?? "",
  type: resource.type ?? "tool",
  priority:
    typeof resource.priority === "number" &&
    Number.isFinite(resource.priority) &&
    resource.priority >= 1 &&
    resource.priority <= 5
      ? String(Math.round(resource.priority))
      : "3",
  tags: resource.tags?.join(", ") ?? "",
  relatedResourceIds:
    resource.relatedResources
      ?.map((relatedResource) => relatedResource.id)
      .filter(Boolean)
      .join(", ") ?? "",
  categories:
    resource.categories
      ?.map((category) => category.name ?? "")
      .filter(Boolean)
      .join(", ") ?? "",
  categoryIds:
    resource.categories
      ?.map((category) => category.bookingCategoryId ?? "")
      .filter(Boolean)
      .join(", ") ?? "",
  attachable: resource.attachable ?? false,
});

export const getResourceImages = (resource: Resource) => {
  if (resource.images && resource.images.length > 0) {
    return resource.images;
  }
  if (resource.image) {
    return [resource.image];
  }
  return [];
};
