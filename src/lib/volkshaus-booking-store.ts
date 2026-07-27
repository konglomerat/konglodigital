import "server-only";

import { randomUUID } from "node:crypto";

import { isMissingRelationError } from "@/lib/supabase-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  VolkshausBooking,
  VolkshausContractSnapshot,
  VolkshausContractStatus,
  VolkshausEquipmentId,
  VolkshausInvoiceStatus,
  VolkshausPaymentStatus,
  VolkshausPriceSnapshot,
  VolkshausRequestStatus,
  VolkshausReservationStatus,
  VolkshausRoomId,
  VolkshausSignature,
} from "@/lib/volkshaus-booking";

const TABLE_NAME = "volkshaus_booking_requests";
const AUDIT_TABLE_NAME = "volkshaus_booking_events";

type BookingRow = Record<string, unknown>;

type CreateBookingParams = Omit<
  VolkshausBooking,
  | "id"
  | "requestStatus"
  | "reservationStatus"
  | "contractStatus"
  | "invoiceStatus"
  | "paymentStatus"
  | "priceAdjustmentCents"
  | "priceAdjustmentReason"
  | "internalNotes"
  | "holdExpiresAt"
  | "assignedUserId"
  | "contractVersion"
  | "contractSnapshot"
  | "contractHash"
  | "customerSignature"
  | "customerSignedAt"
  | "staffSignature"
  | "staffSignedAt"
  | "staffSignedBy"
  | "campaiDebtorAccount"
  | "campaiInvoiceId"
  | "campaiError"
  | "notificationStatus"
  | "notificationError"
  | "createdAt"
  | "updatedAt"
>;

export type VolkshausBookingPatch = Partial<
  Pick<
    VolkshausBooking,
    | "requestStatus"
    | "reservationStatus"
    | "contractStatus"
    | "invoiceStatus"
    | "paymentStatus"
    | "priceAdjustmentCents"
    | "priceAdjustmentReason"
    | "internalNotes"
    | "holdExpiresAt"
    | "assignedUserId"
    | "contractVersion"
    | "contractSnapshot"
    | "contractHash"
    | "customerSignature"
    | "customerSignedAt"
    | "staffSignature"
    | "staffSignedAt"
    | "staffSignedBy"
    | "campaiDebtorAccount"
    | "campaiInvoiceId"
    | "campaiError"
    | "notificationStatus"
    | "notificationError"
  >
>;

type AuditEvent = {
  id: string;
  bookingId: string;
  actorType: "customer" | "staff" | "system";
  actorUserId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

declare global {
  var __volkshausBookingMemoryStore:
    | Map<string, VolkshausBooking>
    | undefined;
  var __volkshausBookingMemoryAudit: AuditEvent[] | undefined;
  var __volkshausBookingDatabaseUnavailable: boolean | undefined;
}

const memoryStore =
  globalThis.__volkshausBookingMemoryStore ??
  new Map<string, VolkshausBooking>();
const memoryAudit = globalThis.__volkshausBookingMemoryAudit ?? [];

if (process.env.NODE_ENV !== "production") {
  globalThis.__volkshausBookingMemoryStore = memoryStore;
  globalThis.__volkshausBookingMemoryAudit = memoryAudit;
}

let databaseUnavailable =
  globalThis.__volkshausBookingDatabaseUnavailable ?? false;

const normalizeString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const normalizeNullableString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

const normalizeNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const normalizeNullableNumber = (value: unknown) => {
  const parsed = normalizeNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeObject = <T>(value: unknown, fallback: T): T =>
  value && typeof value === "object" ? (value as T) : fallback;

const mapBookingRow = (row: BookingRow): VolkshausBooking => ({
  id: normalizeString(row.id),
  referenceCode: normalizeString(row.reference_code),
  accessToken: normalizeString(row.access_token),
  requestStatus: normalizeString(
    row.request_status,
    "new",
  ) as VolkshausRequestStatus,
  reservationStatus: normalizeString(
    row.reservation_status,
    "none",
  ) as VolkshausReservationStatus,
  contractStatus: normalizeString(
    row.contract_status,
    "draft",
  ) as VolkshausContractStatus,
  invoiceStatus: normalizeString(
    row.invoice_status,
    "not_created",
  ) as VolkshausInvoiceStatus,
  paymentStatus: normalizeString(
    row.payment_status,
    "not_due",
  ) as VolkshausPaymentStatus,
  customerName: normalizeString(row.customer_name),
  organization: normalizeNullableString(row.organization),
  email: normalizeString(row.email),
  phone: normalizeNullableString(row.phone),
  billingAddressLine: normalizeString(row.billing_address_line),
  billingZip: normalizeString(row.billing_zip),
  billingCity: normalizeString(row.billing_city),
  eventTitle: normalizeString(row.event_title),
  eventDescription: normalizeString(row.event_description),
  usageType: normalizeString(
    row.usage_type,
    "commercial",
  ) as VolkshausBooking["usageType"],
  frequency: normalizeString(
    row.frequency,
    "one_time",
  ) as VolkshausBooking["frequency"],
  recurringOccurrences: normalizeNumber(row.recurring_occurrences, 1),
  expectedAttendees: normalizeNumber(row.expected_attendees, 1),
  bookingDate: normalizeString(row.booking_date),
  startTime: normalizeString(row.start_time),
  endTime: normalizeString(row.end_time),
  setupStartTime: normalizeNullableString(row.setup_start_time),
  teardownEndTime: normalizeNullableString(row.teardown_end_time),
  startAt: normalizeString(row.start_at),
  endAt: normalizeString(row.end_at),
  setupStartAt: normalizeNullableString(row.setup_start_at),
  teardownEndAt: normalizeNullableString(row.teardown_end_at),
  requestedRooms: Array.isArray(row.requested_rooms)
    ? (row.requested_rooms as VolkshausRoomId[])
    : [],
  equipment: normalizeObject<
    Partial<Record<VolkshausEquipmentId, number>>
  >(row.equipment, {}),
  specialRequirements: normalizeNullableString(row.special_requirements),
  priceSnapshot: normalizeObject<VolkshausPriceSnapshot>(row.price_snapshot, {
    tariffVersion: "",
    currency: "EUR",
    lines: [],
    netCents: 0,
    taxCents: 0,
    grossCents: 0,
    requiresManualReview: true,
    reviewReasons: ["Preisdaten fehlen."],
  }),
  priceAdjustmentCents: normalizeNumber(row.price_adjustment_cents, 0),
  priceAdjustmentReason: normalizeNullableString(row.price_adjustment_reason),
  internalNotes: normalizeNullableString(row.internal_notes),
  holdExpiresAt: normalizeNullableString(row.hold_expires_at),
  assignedUserId: normalizeNullableString(row.assigned_user_id),
  contractVersion: normalizeNumber(row.contract_version, 0),
  contractSnapshot: normalizeObject<VolkshausContractSnapshot | null>(
    row.contract_snapshot,
    null,
  ),
  contractHash: normalizeNullableString(row.contract_hash),
  customerSignature: normalizeObject<VolkshausSignature | null>(
    row.customer_signature,
    null,
  ),
  customerSignedAt: normalizeNullableString(row.customer_signed_at),
  staffSignature: normalizeObject<VolkshausSignature | null>(
    row.staff_signature,
    null,
  ),
  staffSignedAt: normalizeNullableString(row.staff_signed_at),
  staffSignedBy: normalizeNullableString(row.staff_signed_by),
  campaiDebtorAccount: normalizeNullableNumber(row.campai_debtor_account),
  campaiInvoiceId: normalizeNullableString(row.campai_invoice_id),
  campaiError: normalizeNullableString(row.campai_error),
  notificationStatus: normalizeNullableString(row.notification_status),
  notificationError: normalizeNullableString(row.notification_error),
  createdAt: normalizeString(row.created_at),
  updatedAt: normalizeString(row.updated_at),
});

const toBookingRow = (booking: VolkshausBooking): BookingRow => ({
  id: booking.id,
  reference_code: booking.referenceCode,
  access_token: booking.accessToken,
  request_status: booking.requestStatus,
  reservation_status: booking.reservationStatus,
  contract_status: booking.contractStatus,
  invoice_status: booking.invoiceStatus,
  payment_status: booking.paymentStatus,
  customer_name: booking.customerName,
  organization: booking.organization,
  email: booking.email,
  phone: booking.phone,
  billing_address_line: booking.billingAddressLine,
  billing_zip: booking.billingZip,
  billing_city: booking.billingCity,
  event_title: booking.eventTitle,
  event_description: booking.eventDescription,
  usage_type: booking.usageType,
  frequency: booking.frequency,
  recurring_occurrences: booking.recurringOccurrences,
  expected_attendees: booking.expectedAttendees,
  booking_date: booking.bookingDate,
  start_time: booking.startTime,
  end_time: booking.endTime,
  setup_start_time: booking.setupStartTime,
  teardown_end_time: booking.teardownEndTime,
  start_at: booking.startAt,
  end_at: booking.endAt,
  setup_start_at: booking.setupStartAt,
  teardown_end_at: booking.teardownEndAt,
  requested_rooms: booking.requestedRooms,
  equipment: booking.equipment,
  special_requirements: booking.specialRequirements,
  price_snapshot: booking.priceSnapshot,
  price_adjustment_cents: booking.priceAdjustmentCents,
  price_adjustment_reason: booking.priceAdjustmentReason,
  internal_notes: booking.internalNotes,
  hold_expires_at: booking.holdExpiresAt,
  assigned_user_id: booking.assignedUserId,
  contract_version: booking.contractVersion,
  contract_snapshot: booking.contractSnapshot,
  contract_hash: booking.contractHash,
  customer_signature: booking.customerSignature,
  customer_signed_at: booking.customerSignedAt,
  staff_signature: booking.staffSignature,
  staff_signed_at: booking.staffSignedAt,
  staff_signed_by: booking.staffSignedBy,
  campai_debtor_account: booking.campaiDebtorAccount,
  campai_invoice_id: booking.campaiInvoiceId,
  campai_error: booking.campaiError,
  notification_status: booking.notificationStatus,
  notification_error: booking.notificationError,
  created_at: booking.createdAt,
  updated_at: booking.updatedAt,
});

const toPatchRow = (patch: VolkshausBookingPatch): BookingRow => {
  const keyMap: Record<keyof VolkshausBookingPatch, string> = {
    requestStatus: "request_status",
    reservationStatus: "reservation_status",
    contractStatus: "contract_status",
    invoiceStatus: "invoice_status",
    paymentStatus: "payment_status",
    priceAdjustmentCents: "price_adjustment_cents",
    priceAdjustmentReason: "price_adjustment_reason",
    internalNotes: "internal_notes",
    holdExpiresAt: "hold_expires_at",
    assignedUserId: "assigned_user_id",
    contractVersion: "contract_version",
    contractSnapshot: "contract_snapshot",
    contractHash: "contract_hash",
    customerSignature: "customer_signature",
    customerSignedAt: "customer_signed_at",
    staffSignature: "staff_signature",
    staffSignedAt: "staff_signed_at",
    staffSignedBy: "staff_signed_by",
    campaiDebtorAccount: "campai_debtor_account",
    campaiInvoiceId: "campai_invoice_id",
    campaiError: "campai_error",
    notificationStatus: "notification_status",
    notificationError: "notification_error",
  };

  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [
      keyMap[key as keyof VolkshausBookingPatch],
      value,
    ]),
  );
};

const canUseMemoryFallback = () =>
  process.env.VOLKSHAUS_BOOKING_STORAGE === "memory" ||
  process.env.NODE_ENV !== "production";

const isStorageSetupError = (error: unknown) => {
  if (
    isMissingRelationError(error, TABLE_NAME) ||
    isMissingRelationError(error, AUDIT_TABLE_NAME)
  ) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  return (
    code === "PGRST205" ||
    message.includes("Missing SUPABASE_") ||
    message.includes(TABLE_NAME) ||
    message.includes(AUDIT_TABLE_NAME) ||
    message.includes("schema cache")
  );
};

const withFallback = async <T>(
  databaseOperation: () => Promise<T>,
  memoryOperation: () => T | Promise<T>,
) => {
  if (process.env.VOLKSHAUS_BOOKING_STORAGE === "memory") {
    return memoryOperation();
  }
  if (canUseMemoryFallback() && databaseUnavailable) {
    return memoryOperation();
  }

  try {
    return await databaseOperation();
  } catch (error) {
    if (canUseMemoryFallback() && isStorageSetupError(error)) {
      databaseUnavailable = true;
      if (process.env.NODE_ENV !== "production") {
        globalThis.__volkshausBookingDatabaseUnavailable = true;
      }
      console.warn(
        `[volkshaus] ${TABLE_NAME} ist noch nicht verfügbar; verwende den flüchtigen Entwicklungs-Speicher.`,
      );
      return memoryOperation();
    }
    throw error;
  }
};

const createInitialBooking = (params: CreateBookingParams): VolkshausBooking => {
  const now = new Date().toISOString();
  return {
    ...params,
    id: randomUUID(),
    requestStatus: "new",
    reservationStatus: "none",
    contractStatus: "draft",
    invoiceStatus: "not_created",
    paymentStatus: "not_due",
    priceAdjustmentCents: 0,
    priceAdjustmentReason: null,
    internalNotes: null,
    holdExpiresAt: null,
    assignedUserId: null,
    contractVersion: 0,
    contractSnapshot: null,
    contractHash: null,
    customerSignature: null,
    customerSignedAt: null,
    staffSignature: null,
    staffSignedAt: null,
    staffSignedBy: null,
    campaiDebtorAccount: null,
    campaiInvoiceId: null,
    campaiError: null,
    notificationStatus: null,
    notificationError: null,
    createdAt: now,
    updatedAt: now,
  };
};

export const createVolkshausBooking = async (params: CreateBookingParams) => {
  const booking = createInitialBooking(params);

  return withFallback(
    async () => {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert(toBookingRow(booking))
        .select("*")
        .single();
      if (error) throw error;
      return mapBookingRow(data as BookingRow);
    },
    () => {
      memoryStore.set(booking.id, booking);
      return booking;
    },
  );
};

export const listVolkshausBookings = async () =>
  withFallback(
    async () => {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapBookingRow(row as BookingRow));
    },
    () =>
      Array.from(memoryStore.values()).sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
  );

export const getVolkshausBookingById = async (id: string) =>
  withFallback(
    async () => {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapBookingRow(data as BookingRow) : null;
    },
    () => memoryStore.get(id) ?? null,
  );

export const getVolkshausBookingByToken = async (accessToken: string) =>
  withFallback(
    async () => {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select("*")
        .eq("access_token", accessToken)
        .maybeSingle();
      if (error) throw error;
      return data ? mapBookingRow(data as BookingRow) : null;
    },
    () =>
      Array.from(memoryStore.values()).find(
        (booking) => booking.accessToken === accessToken,
      ) ?? null,
  );

export const updateVolkshausBooking = async (
  id: string,
  patch: VolkshausBookingPatch,
) =>
  withFallback(
    async () => {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({
          ...toPatchRow(patch),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return mapBookingRow(data as BookingRow);
    },
    () => {
      const current = memoryStore.get(id);
      if (!current) {
        throw new Error("Buchungsanfrage wurde nicht gefunden.");
      }
      const updated: VolkshausBooking = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      memoryStore.set(id, updated);
      return updated;
    },
  );

export const addVolkshausBookingEvent = async (params: {
  bookingId: string;
  actorType: AuditEvent["actorType"];
  actorUserId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) => {
  const event: AuditEvent = {
    id: randomUUID(),
    bookingId: params.bookingId,
    actorType: params.actorType,
    actorUserId: params.actorUserId ?? null,
    eventType: params.eventType,
    payload: params.payload ?? {},
    createdAt: new Date().toISOString(),
  };

  return withFallback(
    async () => {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from(AUDIT_TABLE_NAME).insert({
        id: event.id,
        booking_id: event.bookingId,
        actor_type: event.actorType,
        actor_user_id: event.actorUserId,
        event_type: event.eventType,
        payload: event.payload,
        created_at: event.createdAt,
      });
      if (error) throw error;
      return event;
    },
    () => {
      memoryAudit.push(event);
      return event;
    },
  );
};
