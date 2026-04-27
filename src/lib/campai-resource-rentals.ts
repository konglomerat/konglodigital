import type { SupabaseClient } from "@supabase/supabase-js";

import type { MemberProfile } from "@/lib/member-profiles";
import { getResourceMediaKindFromUrl } from "@/lib/resource-media";

export type CampaiSyncStatus = "pending" | "synced" | "failed" | "skipped";

export type ResourceSyncRecord = {
  id: string;
  name: string;
  description: string | null;
  image?: string | null;
  images?: string[] | null;
  type: string | null;
  attachable: boolean | null;
  categories: Array<{ name?: string; bookingCategoryId?: string | null }> | null;
  campai_resource_id?: string | null;
  campai_offer_id?: string | null;
  campai_default_rate_id?: string | null;
  campai_site_id?: string | null;
};

export type CampaiRentalViewer = {
  authenticated: boolean;
  hasConnectedCampaiAccount: boolean;
  displayName: string | null;
};

export type CampaiRentalStatusItem = {
  id: string;
  type: "booking" | "custom" | "event";
  status: string;
  from: string;
  to: string;
  description: string | null;
  quantity: number | null;
  bookingRecordNumber: string | null;
};

export type CampaiRentalSnapshot = {
  synced: boolean;
  syncStatus: CampaiSyncStatus;
  syncError: string | null;
  viewer: CampaiRentalViewer;
  sessionMinutes: number;
  siteName: string | null;
  siteId: string | null;
  currentStatus: {
    label: string;
    activeReservationCount: number;
    nextChangeAt: string | null;
  };
  activeReservations: CampaiRentalStatusItem[];
  previousRents: CampaiRentalStatusItem[];
};

export type CampaiBookingRequest = {
  userEmail: string;
  userName: string;
  memberProfile: MemberProfile;
  resourceId: string;
  start: string;
  end: string;
};

type CampaiSite = {
  id: string;
  name: string;
};

type CampaiReservation = {
  _id?: string;
  type?: string;
  status?: string;
  period?: {
    from?: string;
    to?: string;
  };
  description?: string | null;
  quantity?: number | null;
  booking?: {
    recordNumber?: string | null;
  } | null;
  site?: {
    site?: string;
    name?: string;
  } | null;
};

type CampaiResourceDetails = {
  _id?: string;
  info?: {
    name?: string;
    description?: string;
    image?: {
      resource?: string;
      fileName?: string;
      contentType?: string;
      fileSizeBytes?: number;
    } | null;
  } | null;
  offer?: {
    sessionMinutes?: number;
  } | null;
  sites?: Array<{
    site?: string;
    name?: string;
  }> | null;
};

type CampaiListedResource = {
  _id?: string;
  type?: string;
  info?: {
    name?: string;
  } | null;
};

type CampaiImageUpload = {
  resource: string;
  fileName: string;
  contentType?: string;
  fileSizeBytes?: number;
};

type CampaiResourceImage = {
  resource?: string;
  fileName?: string;
  contentType?: string;
  fileSizeBytes?: number;
} | null;

type CampaiResourceInfoPayload = {
  name: string;
  description: string;
  tags: string[];
  categories: Array<{
    name: string;
    nameNormalized: string;
    bookingCategoryId: string;
  }>;
  image?: {
    resource: string;
    fileName: string;
  } | null;
};

const requiredEnv = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const optionalEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

const DEFAULT_CAMPAI_SITE_NAME = "Standort Rosenwerk";
const CAMPAI_RESOURCE_OFFER_MAX_SLOTS = 24;

const parsePositiveInt = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toPositiveNumber = (value: unknown) => {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compactText = (value: string | null | undefined, maxLength: number) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, maxLength);
};

const normalizeMatchText = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";

const mapLocalResourceTypeToCampai = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  switch (normalized) {
    case "place":
    case "person":
    case "vehicle":
    case "tool":
    case "clothing":
    case "object":
    case "other":
      return normalized;
    case "furniture":
      return "object";
    case "project":
      return null;
    default:
      return "other";
  }
};

const buildCategoryPayload = (
  categories: ResourceSyncRecord["categories"],
) => {
  return (categories ?? [])
    .map((category) => {
      const name = compactText(category.name ?? "", 60);
      const bookingCategoryId = category.bookingCategoryId?.trim() ?? "";
      if (!name || !bookingCategoryId) {
        return null;
      }
      return {
        name,
        nameNormalized: name.toLowerCase(),
        bookingCategoryId,
      };
    })
    .filter(
      (
        category,
      ): category is {
        name: string;
        nameNormalized: string;
        bookingCategoryId: string;
      } => Boolean(category),
    );
};

const buildCampaiResourceInfo = (
  resource: ResourceSyncRecord,
): CampaiResourceInfoPayload => ({
  name: compactText(resource.name, 100),
  description: compactText(resource.description ?? "", 140),
  tags: [],
  categories: buildCategoryPayload(resource.categories),
});

const buildDefaultCampaiOfferSettings = () => {
  return {
    sessionMinutes: 20,
    sessionRetries: 0,
    paymentMethods: {
      sepaCreditTransfer: null,
      sepaDirectDebit: null,
      online: null,
      cash: null,
    },
    paymentMethodsPending: "unpaid",
    disallowCancelation: false,
    refundPolicies: [],
    refundText: "",
    formSettings: {
      addressMode: "optional",
      applicantType: "person",
      organisationNamePlaceholder: "",
      requirePhone: false,
      showDiscountCode: false,
      showRefundPolicies: true,
      membershipNumberLabel: "",
    },
    form: {
      groups: [
        {
          id: "x:reservations",
          label: "Reservierungen",
          fields: [
            {
              id: "x:resource",
              type: "placeholder",
              name: "Informationen zur Ressource",
            },
          ],
          minItems: 1,
          maxItems: 99,
        },
        {
          id: "x:applicant",
          label: "Daten der antragstellenden Person",
          fields: [
            {
              id: "x:name",
              type: "text",
              label: "Dein Name",
              placeholder: "Max Mustermann",
              required: true,
              format: "text",
              maxLength: 81,
            },
            {
              id: "x:emailAndPhone",
              type: "row",
              fields: [
                {
                  id: "x:email",
                  type: "text",
                  stretch: 1,
                  label: "E-Mail-Adresse",
                  placeholder: "max@mustermann.de",
                  required: true,
                  format: "email",
                  maxLength: 100,
                },
                {
                  id: "x:phone",
                  type: "text",
                  stretch: 1,
                  label: "Telefonnummer",
                  required: false,
                  format: "phone",
                  maxLength: 24,
                  phone: {
                    defaultCountry: "DE",
                  },
                },
              ],
            },
            {
              id: "x:address",
              type: "address",
              label: "Optionale Adresse",
              hint: "Wenn du willst, kannst du hier eine Rechnungsadresse angeben",
              required: false,
              autoComplete: false,
              hasDetails: true,
              defaultCountry: "DE",
            },
            {
              id: "x:membership",
              type: "placeholder",
              name: "Mitgliedschaftsinformationen",
            },
          ],
        },
        {
          id: "x:summary",
          label: "Zusammenfassung",
          fields: [
            {
              id: "x:summary",
              type: "placeholder",
              name: "Buchungsübersicht",
            },
            {
              id: "x:refundPolicies",
              type: "placeholder",
              name: "Rückerstattungsrichtlinien",
            },
          ],
        },
      ],
    },
    availabilityHours: null,
    availabilityWeekdays: {
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: true,
      sun: true,
    },
    availableOnWatchlist: false,
    rates: [],
    services: [],
    slots: {
      size: 60,
      unit: "minutes",
      minimum: 1,
      maximum: CAMPAI_RESOURCE_OFFER_MAX_SLOTS,
      chargeRateBySlotNumber: true,
    },
    quantity: null,
    block: null,
    attachReceipt: false,
  };
};

const getCampaiConfig = () => {
  const organizationId = requiredEnv("CAMPAI_ORGANIZATION_ID");
  const mandateId = requiredEnv("CAMPAI_MANDATE_ID");

  return {
    apiKey: requiredEnv("CAMPAI_API_KEY"),
    organizationId,
    mandateId,
    apiRoot: "https://cloud.campai.com/api",
    baseUrl: `https://cloud.campai.com/api/${organizationId}/${mandateId}`,
  };
};

const resolveCampaiUrl = (path: string) => {
  const { apiRoot, baseUrl, organizationId } = getCampaiConfig();
  if (
    path.startsWith("/storage/") ||
    path.startsWith("/organizations/") ||
    path.startsWith("/apiKey/") ||
    path.startsWith("/extensions/") ||
    path.startsWith(`/${organizationId}/`)
  ) {
    return `${apiRoot}${path}`;
  }
  return `${baseUrl}${path}`;
};

const resolveCampaiRateAccount = async () => {
  const configuredAccount = parsePositiveInt(optionalEnv("CAMPAI_ACCOUNT"));
  const { organizationId } = getCampaiConfig();
  const accountingPlan = await fetchCampaiJson<{
    settings?: {
      defaultResourceRateAccount?: number | null;
      defaultRevenueAccount?: number | null;
    } | null;
    accounts?: Array<{
      number?: number | null;
    }> | null;
  }>(`/${organizationId}/finance/accounting/accountingPlan`);

  const availableAccounts = new Set(
    (accountingPlan.accounts ?? [])
      .map((account) =>
        typeof account.number === "number" && account.number > 0
          ? account.number
          : null,
      )
      .filter((account): account is number => account !== null),
  );

  if (configuredAccount && availableAccounts.has(configuredAccount)) {
    return configuredAccount;
  }

  const defaultResourceRateAccount =
    typeof accountingPlan.settings?.defaultResourceRateAccount === "number" &&
    accountingPlan.settings.defaultResourceRateAccount > 0
      ? accountingPlan.settings.defaultResourceRateAccount
      : null;

  if (defaultResourceRateAccount) {
    return defaultResourceRateAccount;
  }

  const defaultRevenueAccount =
    typeof accountingPlan.settings?.defaultRevenueAccount === "number" &&
    accountingPlan.settings.defaultRevenueAccount > 0
      ? accountingPlan.settings.defaultRevenueAccount
      : null;

  if (defaultRevenueAccount) {
    return defaultRevenueAccount;
  }

  if (configuredAccount) {
    throw new Error(
      `Configured CAMPAI_ACCOUNT ${configuredAccount} is not part of the Campai accounting plan, and no default resource rate account is configured.`,
    );
  }

  throw new Error(
    "No valid Campai rate account is configured. Set CAMPAI_ACCOUNT or configure a default resource rate account in Campai.",
  );
};

const normalizeCampaiErrorMessage = (rawMessage: string, path: string) => {
  const trimmed = rawMessage.trim();
  let parsedMessage = trimmed;
  let parsedCode = "";

  try {
    const parsed = JSON.parse(trimmed) as {
      message?: string;
      code?: string;
      data?: { code?: string; path?: string };
    };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      parsedMessage = parsed.message.trim();
    }
    if (typeof parsed.code === "string") {
      parsedCode = parsed.code;
    }
  } catch {
    parsedMessage = trimmed;
  }

  if (parsedMessage.includes("Missing resourceOffer.insert")) {
      return "Campai denied creating the rental offer. The configured API key is missing the `resourceOffer.insert` permission. Add that permission in Campai, then sync the resource again.";
  }

  if (parsedMessage.includes("Missing resource.insert")) {
    return "Campai denied creating the resource. The configured API key is missing the `resource.insert` permission.";
  }

  if (parsedMessage.includes("Missing resource.update")) {
    return "Campai denied updating the resource. The configured API key is missing the `resource.update` permission.";
  }

  if (parsedMessage.includes("Missing booking.insert")) {
    return "Campai denied creating the rental booking. The configured API key is missing the `booking.insert` permission.";
  }

  if (parsedMessage.includes("Missing resourceReservation.insert")) {
    return "Campai denied creating the reservation. The configured API key is missing the `resourceReservation.insert` permission.";
  }

  if (parsedCode === "FORBIDDEN") {
    return `Campai denied this request for \`${path}\`. ${parsedMessage}`;
  }

  return parsedMessage || `Campai request failed for ${path}.`;
};

const fetchCampaiJson = async <T,>(path: string, body?: unknown) => {
  const { apiKey } = getCampaiConfig();
  const response = await fetch(resolveCampaiUrl(path), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      normalizeCampaiErrorMessage(
        errorText || `Campai request failed for ${path}.`,
        path,
      ),
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  const responseText = await response.text().catch(() => "");
  if (!responseText.trim()) {
    return null as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`Campai returned invalid JSON for ${path}.`);
  }
};

const deleteCampaiPath = async (path: string) => {
  const { apiKey } = getCampaiConfig();
  const response = await fetch(resolveCampaiUrl(path), {
    method: "DELETE",
    headers: {
      "X-API-Key": apiKey,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      normalizeCampaiErrorMessage(
        errorText || `Campai request failed for ${path}.`,
        path,
      ),
    );
  }
};

const updateLocalCampaiSyncState = async (
  adminClient: SupabaseClient,
  resourceId: string,
  payload: {
    campai_resource_id?: string | null;
    campai_offer_id?: string | null;
    campai_default_rate_id?: string | null;
    campai_site_id?: string | null;
    campai_sync_status: CampaiSyncStatus;
    campai_sync_error?: string | null;
  },
) => {
  const { error } = await adminClient
    .from("resources")
    .update({
      ...payload,
      campai_last_synced_at:
        payload.campai_sync_status === "synced" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", resourceId);

  if (error) {
    throw new Error(error.message || "Unable to persist Campai sync state.");
  }
};

const loadDefaultCampaiSite = async (): Promise<CampaiSite | null> => {
  const configuredSiteId = optionalEnv("CAMPAI_RESOURCE_SITE_ID");
  if (configuredSiteId) {
    return { id: configuredSiteId, name: DEFAULT_CAMPAI_SITE_NAME };
  }

  const configuredSiteName =
    optionalEnv("CAMPAI_RESOURCE_SITE_NAME") ?? DEFAULT_CAMPAI_SITE_NAME;

  const payload = await fetchCampaiJson<{
    sites?: Array<{ _id?: string; id?: string; name?: string }>;
  }>("/booking/resources/sites/list", {
    limit: 100,
    offset: 0,
    returnCount: false,
  });

  const matchingSite = payload.sites?.find(
    (site) =>
      typeof (site._id ?? site.id) === "string" &&
      normalizeMatchText(site.name) === normalizeMatchText(configuredSiteName),
  );

  if (matchingSite) {
    return {
      id: (matchingSite._id ?? matchingSite.id)!,
      name: matchingSite.name?.trim() || configuredSiteName,
    };
  }

  return null;
};

const createCampaiOffer = async (resource: ResourceSyncRecord) => {
  const payload = await fetchCampaiJson<{ _id: string }>(
    "/booking/resources/offers",
    {
      name: compactText(resource.name, 40),
      description: compactText(resource.description ?? "", 140),
      offer: buildDefaultCampaiOfferSettings(),
    },
  );

  return payload._id;
};

const syncCampaiOffer = async (
  resource: ResourceSyncRecord,
  existingOfferId: string | null,
) => {
  if (!existingOfferId) {
    return createCampaiOffer(resource);
  }

  const offerId = existingOfferId;
  const offer = await fetchCampaiJson<Record<string, unknown>>(
    `/booking/resources/offers/${offerId}`,
  );
  const slots = isRecord(offer.slots) ? offer.slots : {};
  const defaultOfferSettings = buildDefaultCampaiOfferSettings();

  await fetchCampaiJson(`/booking/resources/offers/${offerId}`, {
    sessionMinutes:
      toPositiveNumber(offer.sessionMinutes) ?? defaultOfferSettings.sessionMinutes,
    sessionRetries:
      typeof offer.sessionRetries === "number" && Number.isFinite(offer.sessionRetries)
        ? offer.sessionRetries
        : defaultOfferSettings.sessionRetries,
    paymentMethods: isRecord(offer.paymentMethods)
      ? offer.paymentMethods
      : defaultOfferSettings.paymentMethods,
    paymentMethodsPending:
      typeof offer.paymentMethodsPending === "string"
        ? offer.paymentMethodsPending
        : defaultOfferSettings.paymentMethodsPending,
    disallowCancelation: offer.disallowCancelation === true,
    refundPolicies: Array.isArray(offer.refundPolicies) ? offer.refundPolicies : [],
    refundText: typeof offer.refundText === "string" ? offer.refundText : "",
    formSettings: isRecord(offer.formSettings)
      ? offer.formSettings
      : defaultOfferSettings.formSettings,
    availabilityHours: isRecord(offer.availabilityHours)
      ? offer.availabilityHours
      : defaultOfferSettings.availabilityHours,
    availabilityWeekdays: isRecord(offer.availabilityWeekdays)
      ? offer.availabilityWeekdays
      : defaultOfferSettings.availabilityWeekdays,
    availableOnWatchlist: offer.availableOnWatchlist === true,
    slots: {
      size: toPositiveNumber(slots.size) ?? defaultOfferSettings.slots.size,
      unit:
        slots.unit === "minutes" ||
        slots.unit === "hours" ||
        slots.unit === "days"
          ? slots.unit
          : defaultOfferSettings.slots.unit,
      minimum:
        toPositiveNumber(slots.minimum) ?? defaultOfferSettings.slots.minimum,
      maximum: Math.max(
        toPositiveNumber(slots.maximum) ?? 1,
        CAMPAI_RESOURCE_OFFER_MAX_SLOTS,
      ),
      chargeRateBySlotNumber: slots.chargeRateBySlotNumber !== false,
    },
    quantity: isRecord(offer.quantity) ? offer.quantity : defaultOfferSettings.quantity,
    block: isRecord(offer.block) ? offer.block : defaultOfferSettings.block,
    attachReceipt: offer.attachReceipt === true,
  });

  return offerId;
};

const sanitizeUploadFileName = (value: string) =>
  value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");

const detectFileNameFromUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const tail = parsed.pathname.split("/").pop() ?? "cover";
    return sanitizeUploadFileName(tail || "cover");
  } catch {
    return "cover";
  }
};

const getCoverImageCandidates = (resource: ResourceSyncRecord) => {
  const candidates = [resource.image, ...(resource.images ?? [])]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);

  return Array.from(new Set(candidates)).filter(
    (value) => getResourceMediaKindFromUrl(value) === "image",
  );
};

const uploadCoverImageToCampai = async (
  resource: ResourceSyncRecord,
): Promise<CampaiImageUpload | null> => {
  const candidateUrls = getCoverImageCandidates(resource);
  if (candidateUrls.length === 0) {
    return null;
  }

  let lastError: Error | null = null;

  for (const sourceUrl of candidateUrls) {
    try {
      const sourceResponse = await fetch(sourceUrl, { cache: "no-store" });
      if (!sourceResponse.ok) {
        throw new Error(`HTTP ${sourceResponse.status}`);
      }

      const contentType =
        sourceResponse.headers.get("content-type")?.trim() || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        continue;
      }

      const arrayBuffer = await sourceResponse.arrayBuffer();
      const fileBytes = Buffer.from(arrayBuffer);
      if (fileBytes.length === 0) {
        continue;
      }

      const uploadTarget = await fetchCampaiJson<{ id: string; url: string }>(
        "/storage/uploadUrl",
      );

      const fileName =
        detectFileNameFromUrl(sourceUrl) || `cover-${resource.id}.jpg`;
      const uploadResponse = await fetch(uploadTarget.url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body: fileBytes,
      });

      if (!uploadResponse.ok) {
        const uploadError = await uploadResponse.text().catch(() => "");
        throw new Error(uploadError || "Campai image upload failed.");
      }

      return {
        resource: uploadTarget.id,
        fileName,
        contentType,
        fileSizeBytes: fileBytes.length,
      };
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(`Unable to upload cover image from ${sourceUrl}.`);
    }
  }

  if (lastError) {
    throw new Error(
      `Unable to upload any cover image for "${resource.name}". ${lastError.message}`,
    );
  }

  return null;
};

const hasCampaiSiteAssignment = (
  resourceDetails: CampaiResourceDetails | null | undefined,
  siteId: string | null | undefined,
) => {
  if (!siteId) {
    return true;
  }

  return (resourceDetails?.sites ?? []).some(
    (site) => (site.site?.trim() ?? "") === siteId,
  );
};

const buildCampaiInfoWithImage = async (
  resource: ResourceSyncRecord,
  existingImage: CampaiResourceImage,
) => {
  if (existingImage?.resource) {
    return {
      ...buildCampaiResourceInfo(resource),
      image: existingImage,
    };
  }

  const coverImage = await uploadCoverImageToCampai(resource);
  return {
    ...buildCampaiResourceInfo(resource),
    image: coverImage
      ? {
          resource: coverImage.resource,
          fileName: coverImage.fileName,
        }
      : null,
  };
};

const createCampaiResourceAtSite = async (
  resource: ResourceSyncRecord,
  type: string,
  siteId: string | null,
) => {
  const createInfo = buildCampaiResourceInfo(resource);
  const payload = await fetchCampaiJson<{ _id: string }>("/booking/resources", {
    type,
    attachable: Boolean(resource.attachable),
    info: createInfo,
    siteIds: siteId ? [siteId] : undefined,
  });

  const updateInfo = await buildCampaiInfoWithImage(resource, null);
  await fetchCampaiJson(`/booking/resources/${payload._id}`, {
    info: updateInfo,
    attachable: Boolean(resource.attachable),
    siteIds: siteId ? [siteId] : undefined,
  });

  return payload._id;
};

const updateCampaiResourceAtSite = async (
  resourceId: string,
  resource: ResourceSyncRecord,
  siteId: string | null,
  existingDetails: CampaiResourceDetails,
) => {
  const updateInfo = await buildCampaiInfoWithImage(
    resource,
    existingDetails.info?.image ?? null,
  );

  await fetchCampaiJson(`/booking/resources/${resourceId}`, {
    info: updateInfo,
    attachable: Boolean(resource.attachable),
    siteIds: siteId ? [siteId] : undefined,
  });
};

const listExactCampaiResourceMatches = async (
  resource: ResourceSyncRecord,
  type: string,
) => {
  const exactName = normalizeMatchText(resource.name);
  if (!exactName) {
    return [] as string[];
  }

  const payload = await fetchCampaiJson<{
    resources?: CampaiListedResource[];
  }>("/booking/resources/list", {
    limit: 25,
    offset: 0,
    returnCount: false,
    searchTerm: compactText(resource.name, 100),
    types: [type],
  });

  const exactMatches = (payload.resources ?? []).filter((entry) => {
    const candidateId = entry._id?.trim();
    if (!candidateId) {
      return false;
    }
    return (
      normalizeMatchText(entry.info?.name) === exactName &&
      normalizeMatchText(entry.type) === normalizeMatchText(type)
    );
  });

  return exactMatches
    .map((entry) => entry._id?.trim() ?? "")
    .filter(Boolean);
};

const countCampaiReservationsForResource = async (campaiResourceId: string) => {
  const payload = await fetchCampaiJson<{
    count?: number;
    reservations?: Array<{ _id?: string }>;
  }>("/booking/resources/reservations/list", {
    resourceIds: [campaiResourceId],
    limit: 1,
    offset: 0,
    returnCount: true,
  });

  if (typeof payload.count === "number") {
    return payload.count;
  }

  return Array.isArray(payload.reservations) ? payload.reservations.length : 0;
};

const cleanupCampaiDuplicateResources = async (
  adminClient: SupabaseClient,
  params: {
    localResourceId: string;
    localCampaiResourceId?: string | null;
    candidateIds: string[];
  },
) => {
  const uniqueCandidateIds = Array.from(new Set(params.candidateIds)).filter(Boolean);
  if (uniqueCandidateIds.length <= 1) {
    return {
      canonicalId: uniqueCandidateIds[0] ?? null,
      deletedIds: [] as string[],
    };
  }

  const { data: linkedRows, error: linkedError } = await adminClient
    .from("resources")
    .select("id, campai_resource_id")
    .in("campai_resource_id", uniqueCandidateIds);

  if (linkedError) {
    throw new Error(linkedError.message || "Unable to inspect linked Campai resources.");
  }

  const linkedByCampaiId = new Map<string, string[]>();
  (linkedRows ?? []).forEach((row) => {
    const campaiId =
      typeof row.campai_resource_id === "string" ? row.campai_resource_id.trim() : "";
    const localId = typeof row.id === "string" ? row.id : "";
    if (!campaiId || !localId) {
      return;
    }
    const current = linkedByCampaiId.get(campaiId) ?? [];
    current.push(localId);
    linkedByCampaiId.set(campaiId, current);
  });

  let canonicalId =
    params.localCampaiResourceId &&
    uniqueCandidateIds.includes(params.localCampaiResourceId)
      ? params.localCampaiResourceId
      : null;

  if (!canonicalId) {
    const linkedCandidates = uniqueCandidateIds.filter((candidateId) => {
      const linkedLocals = linkedByCampaiId.get(candidateId) ?? [];
      return linkedLocals.length > 0;
    });

    if (linkedCandidates.length === 1) {
      canonicalId = linkedCandidates[0];
    }
  }

  if (!canonicalId) {
    throw new Error(
      "Multiple identical Campai resources exist, but no canonical one could be determined safely. Please link one manually or delete the duplicates in Campai once.",
    );
  }

  const duplicateIds = uniqueCandidateIds.filter((candidateId) => candidateId !== canonicalId);
  const deletedIds: string[] = [];
  const blockedIds: string[] = [];

  for (const duplicateId of duplicateIds) {
    const linkedLocals = linkedByCampaiId.get(duplicateId) ?? [];
    const linkedToOtherLocalResource = linkedLocals.some(
      (localId) => localId !== params.localResourceId,
    );
    if (linkedToOtherLocalResource) {
      blockedIds.push(duplicateId);
      continue;
    }

    const reservationCount = await countCampaiReservationsForResource(duplicateId);
    if (reservationCount > 0) {
      blockedIds.push(duplicateId);
      continue;
    }

    await deleteCampaiPath(`/booking/resources/${duplicateId}`);
    deletedIds.push(duplicateId);
  }

  if (blockedIds.length > 0) {
    throw new Error(
      `Campai duplicates were found, but ${blockedIds.length} duplicate resource(s) could not be deleted safely because they are linked or already have reservation history.`,
    );
  }

  return { canonicalId, deletedIds };
};

const ensureCampaiRate = async (resource: ResourceSyncRecord) => {
  const account = await resolveCampaiRateAccount();

  const costCenter1 = parsePositiveInt(optionalEnv("CAMPAI_COST_CENTER1"));
  const payload = await fetchCampaiJson<{ rateId: string }>(
    `/booking/resources/${resource.campai_resource_id}/rates`,
    {
      name: "Standard",
      description: compactText(resource.description ?? "", 140),
      standard: true,
      charge: {
        type: "price",
        price: {
          isNet: false,
          price: 0,
          taxCode: optionalEnv("CAMPAI_TAX_CODE_0"),
          account,
          costCenter1,
          costCenter2: null,
        },
        punchCard: null,
      },
    },
  );

  return payload.rateId;
};

const upsertCampaiResource = async (
  adminClient: SupabaseClient,
  resource: ResourceSyncRecord,
  siteId: string | null,
) => {
  const type = mapLocalResourceTypeToCampai(resource.type);
  if (!type) {
    return {
      skipped: true as const,
      reason: "Projects are not synced to Campai rentals.",
    };
  }

  if (!resource.campai_resource_id) {
    const exactMatches = await listExactCampaiResourceMatches(resource, type);
    const cleanupResult = await cleanupCampaiDuplicateResources(adminClient, {
      localResourceId: resource.id,
      localCampaiResourceId: resource.campai_resource_id ?? null,
      candidateIds: exactMatches,
    });
    const existingResourceId = cleanupResult.canonicalId;
    if (existingResourceId) {
      const existingDetails = await getCampaiResourceDetails(existingResourceId);
      await updateCampaiResourceAtSite(
        existingResourceId,
        resource,
        siteId,
        existingDetails,
      );
      const updatedDetails = await getCampaiResourceDetails(existingResourceId);
      if (!hasCampaiSiteAssignment(updatedDetails, siteId)) {
        const reservationCount =
          await countCampaiReservationsForResource(existingResourceId);
        if (reservationCount > 0) {
          throw new Error(
            `Campai kept the old site assignment for "${resource.name}". This resource already has reservation history, so it cannot be recreated automatically at Standort Rosenwerk.`,
          );
        }

        await deleteCampaiPath(`/booking/resources/${existingResourceId}`);
        const recreatedId = await createCampaiResourceAtSite(resource, type, siteId);
        return { skipped: false as const, resourceId: recreatedId };
      }

      return { skipped: false as const, resourceId: existingResourceId };
    }

    const createdId = await createCampaiResourceAtSite(resource, type, siteId);
    return { skipped: false as const, resourceId: createdId };
  }

  const exactMatches = await listExactCampaiResourceMatches(resource, type);
  const candidateIds = [
    resource.campai_resource_id,
    ...exactMatches,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const cleanupResult = await cleanupCampaiDuplicateResources(adminClient, {
    localResourceId: resource.id,
    localCampaiResourceId: resource.campai_resource_id ?? null,
    candidateIds,
  });
  const targetResourceId = cleanupResult.canonicalId ?? resource.campai_resource_id;
  const existingDetails = await getCampaiResourceDetails(targetResourceId);
  await updateCampaiResourceAtSite(
    targetResourceId,
    resource,
    siteId,
    existingDetails,
  );
  const updatedDetails = await getCampaiResourceDetails(targetResourceId);
  if (!hasCampaiSiteAssignment(updatedDetails, siteId)) {
    const reservationCount =
      await countCampaiReservationsForResource(targetResourceId);
    if (reservationCount > 0) {
      throw new Error(
        `Campai kept the old site assignment for "${resource.name}". This resource already has reservation history, so it cannot be recreated automatically at Standort Rosenwerk.`,
      );
    }

    await deleteCampaiPath(`/booking/resources/${targetResourceId}`);
    const recreatedId = await createCampaiResourceAtSite(resource, type, siteId);
    return { skipped: false as const, resourceId: recreatedId };
  }

  return { skipped: false as const, resourceId: targetResourceId };
};

export const syncResourceToCampai = async (
  adminClient: SupabaseClient,
  resource: ResourceSyncRecord,
) => {
  try {
    const defaultSite = await loadDefaultCampaiSite();

    if (!defaultSite?.id) {
      throw new Error(
        `No Campai resource site is configured. Set CAMPAI_RESOURCE_SITE_ID or create the "${DEFAULT_CAMPAI_SITE_NAME}" site in Campai.`,
      );
    }

    const upsertResult = await upsertCampaiResource(
      adminClient,
      resource,
      defaultSite.id,
    );
    if (upsertResult.skipped) {
      await updateLocalCampaiSyncState(adminClient, resource.id, {
        campai_resource_id: null,
        campai_offer_id: null,
        campai_default_rate_id: null,
        campai_site_id: null,
        campai_sync_status: "skipped",
        campai_sync_error: upsertResult.reason,
      });
      return { status: "skipped" as const, message: upsertResult.reason };
    }

    const nextResource: ResourceSyncRecord = {
      ...resource,
      campai_resource_id: upsertResult.resourceId,
      campai_site_id: defaultSite.id,
    };

    const replacedResource =
      Boolean(resource.campai_resource_id) &&
      resource.campai_resource_id !== upsertResult.resourceId;
    const offerId = await syncCampaiOffer(
      resource,
      !replacedResource ? resource.campai_offer_id ?? null : null,
    );
    await fetchCampaiJson(`/booking/resources/${upsertResult.resourceId}/offer`, {
      mode: "public",
      offerId,
      useCustomRates: true,
    });

    nextResource.campai_offer_id = offerId;

    const rateId =
      !replacedResource && resource.campai_default_rate_id
        ? resource.campai_default_rate_id
        : await ensureCampaiRate(nextResource);

    await updateLocalCampaiSyncState(adminClient, resource.id, {
      campai_resource_id: upsertResult.resourceId,
      campai_offer_id: offerId,
      campai_default_rate_id: rateId,
      campai_site_id: nextResource.campai_site_id ?? null,
      campai_sync_status: "synced",
      campai_sync_error: null,
    });

    return {
      status: "synced" as const,
      resourceId: upsertResult.resourceId,
      offerId,
      rateId,
      siteId: nextResource.campai_site_id ?? null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Campai sync failed.";

    await updateLocalCampaiSyncState(adminClient, resource.id, {
      campai_resource_id: resource.campai_resource_id ?? null,
      campai_offer_id: resource.campai_offer_id ?? null,
      campai_default_rate_id: resource.campai_default_rate_id ?? null,
      campai_site_id: resource.campai_site_id ?? null,
      campai_sync_status: "failed",
      campai_sync_error: message,
    });

    return {
      status: "failed" as const,
      message,
    };
  }
};

export const listCampaiReservationsForResource = async (
  campaiResourceId: string,
) => {
  const now = new Date();
  const from = new Date(now);
  from.setMonth(from.getMonth() - 6);
  const to = new Date(now);
  to.setMonth(to.getMonth() + 6);

  const payload = await fetchCampaiJson<{
    reservations?: CampaiReservation[];
  }>("/booking/resources/reservations/list", {
    resourceIds: [campaiResourceId],
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    limit: 200,
    offset: 0,
    returnCount: false,
    sort: {
      "period.from": "desc",
    },
  });

  return payload.reservations ?? [];
};

export const getCampaiResourceDetails = async (campaiResourceId: string) => {
  return fetchCampaiJson<CampaiResourceDetails>(
    `/booking/resources/${campaiResourceId}`,
  );
};

const toStatusLabel = (status: string | null | undefined) => {
  switch (status) {
    case "confirmed":
      return "Currently rented";
    case "pending":
      return "Pending rental";
    case "reserved":
      return "Reserved";
    case "maintenance":
      return "Maintenance";
    case "blocked":
      return "Blocked";
    case "outOfOrder":
      return "Out of order";
    case "closed":
      return "Closed";
    default:
      return "Available";
  }
};

export const buildCampaiRentalSnapshot = async (params: {
  resource: ResourceSyncRecord & {
    campai_sync_status?: string | null;
    campai_sync_error?: string | null;
  };
  viewer: CampaiRentalViewer;
}) => {
  const syncStatus =
    params.resource.campai_sync_status === "synced" ||
    params.resource.campai_sync_status === "failed" ||
    params.resource.campai_sync_status === "skipped"
      ? params.resource.campai_sync_status
      : "pending";

  if (!params.resource.campai_resource_id) {
    return {
      synced: false,
      syncStatus,
      syncError: params.resource.campai_sync_error ?? null,
      viewer: params.viewer,
      sessionMinutes: 60,
      siteName: null,
      siteId: params.resource.campai_site_id ?? null,
      currentStatus: {
        label: "Not synced",
        activeReservationCount: 0,
        nextChangeAt: null,
      },
      activeReservations: [],
      previousRents: [],
    } satisfies CampaiRentalSnapshot;
  }

  const [resourceDetails, reservations] = await Promise.all([
    getCampaiResourceDetails(params.resource.campai_resource_id),
    listCampaiReservationsForResource(params.resource.campai_resource_id),
  ]);

  const now = Date.now();
  const activeReservations = reservations
    .filter((reservation) => {
      const from = reservation.period?.from
        ? new Date(reservation.period.from).getTime()
        : Number.NaN;
      const to = reservation.period?.to
        ? new Date(reservation.period.to).getTime()
        : Number.NaN;
      return Number.isFinite(from) && Number.isFinite(to) && from <= now && now < to;
    })
    .map(
      (reservation) =>
        ({
          id: reservation._id ?? crypto.randomUUID(),
          type:
            reservation.type === "booking" ||
            reservation.type === "event" ||
            reservation.type === "custom"
              ? reservation.type
              : "custom",
          status: reservation.status ?? "other",
          from: reservation.period?.from ?? "",
          to: reservation.period?.to ?? "",
          description: reservation.description ?? null,
          quantity:
            typeof reservation.quantity === "number" ? reservation.quantity : null,
          bookingRecordNumber: reservation.booking?.recordNumber ?? null,
        }) satisfies CampaiRentalStatusItem,
    )
    .sort((left, right) => left.from.localeCompare(right.from));

  const previousRents = reservations
    .filter((reservation) => reservation.type === "booking")
    .filter((reservation) => {
      const to = reservation.period?.to
        ? new Date(reservation.period.to).getTime()
        : Number.NaN;
      return Number.isFinite(to) && to < now;
    })
    .map(
      (reservation) =>
        ({
          id: reservation._id ?? crypto.randomUUID(),
          type: "booking",
          status: reservation.status ?? "other",
          from: reservation.period?.from ?? "",
          to: reservation.period?.to ?? "",
          description: reservation.description ?? null,
          quantity:
            typeof reservation.quantity === "number" ? reservation.quantity : null,
          bookingRecordNumber: reservation.booking?.recordNumber ?? null,
        }) satisfies CampaiRentalStatusItem,
    )
    .sort((left, right) => right.from.localeCompare(left.from))
    .slice(0, 8);

  const site = resourceDetails.sites?.[0];
  const nextChangeAt =
    activeReservations
      .map((reservation) => reservation.to)
      .filter(Boolean)
      .sort()[0] ?? null;

  return {
    synced: true,
    syncStatus,
    syncError: params.resource.campai_sync_error ?? null,
    viewer: params.viewer,
    sessionMinutes:
      typeof resourceDetails.offer?.sessionMinutes === "number" &&
      resourceDetails.offer.sessionMinutes > 0
        ? resourceDetails.offer.sessionMinutes
        : 60,
    siteName: site?.name?.trim() ?? null,
    siteId: site?.site ?? params.resource.campai_site_id ?? null,
    currentStatus: {
      label:
        activeReservations.length > 0
          ? toStatusLabel(activeReservations[0]?.status)
          : "Available",
      activeReservationCount: activeReservations.length,
      nextChangeAt,
    },
    activeReservations,
    previousRents,
  } satisfies CampaiRentalSnapshot;
};

export const createCampaiBookingForResource = async (
  resource: ResourceSyncRecord,
  params: CampaiBookingRequest,
) => {
  if (
    !resource.campai_resource_id ||
    !resource.campai_default_rate_id ||
    !resource.campai_site_id
  ) {
    throw new Error("This resource is not ready for Campai rentals yet.");
  }

  const startDate = new Date(params.start);
  const endDate = new Date(params.end);
  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    throw new Error("A valid rental period is required.");
  }

  const resourceDetails = await getCampaiResourceDetails(resource.campai_resource_id);
  const sessionMinutes =
    typeof resourceDetails.offer?.sessionMinutes === "number" &&
    resourceDetails.offer.sessionMinutes > 0
      ? resourceDetails.offer.sessionMinutes
      : 60;
  const slotCount = Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (sessionMinutes * 60_000)),
  );

  const contactId = params.memberProfile.campaiContactId?.trim();
  if (!contactId) {
    throw new Error("Your account is not connected to Campai.");
  }

  const buyerName = compactText(params.userName, 81) || compactText(params.userEmail, 81);
  if (!buyerName) {
    throw new Error("Unable to determine buyer name.");
  }

  return fetchCampaiJson<{ _id: string }>("/booking/resources/bookings", {
    buyer: {
      type: "person",
      name: buyerName,
      email: params.userEmail.trim(),
      personName: buyerName,
      contactId,
      membershipNumber: params.memberProfile.campaiMemberNumber ?? undefined,
    },
    reservations: [
      {
        resourceId: resource.campai_resource_id,
        siteId: resource.campai_site_id,
        rateId: resource.campai_default_rate_id,
        date: startDate.toISOString(),
        slots: slotCount,
        quantity: 1,
      },
    ],
  });
};
