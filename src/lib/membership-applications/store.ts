// Mitgliedsanträge — Lesen und Schreiben der Tabelle membership_applications.
// Nur mit dem Service-Role-Client: Antragstellende haben kein Konto, und den
// Vorstand prüft die App vorher (members.onboarding).
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type {
  ApplicationData,
  ApplicationSignatures,
  ApplicationStatus,
  CampaiProgress,
  Checklist,
  ChecklistEntry,
  ChecklistStep,
  HistoryEntry,
  MembershipApplication,
} from "./types";

const TABLE = "membership_applications";

/** Die Liste braucht die Unterschriften nicht — sie wiegen je ein paar KB. */
const LIST_COLUMNS =
  "id, number, status, email, first_name, last_name, submitted_data, data, campai, checklist, rejection_reason, history, last_error, created_at, updated_at";

const mapRow = (row: Record<string, unknown>): MembershipApplication => ({
  id: String(row.id),
  number: String(row.number),
  status: row.status as ApplicationStatus,
  email: String(row.email),
  firstName: String(row.first_name),
  lastName: String(row.last_name),
  submittedData: row.submitted_data as ApplicationData,
  data: row.data as ApplicationData,
  signatures: (row.signatures as ApplicationSignatures | null | undefined) ?? null,
  campai: (row.campai as CampaiProgress | null) ?? {},
  checklist: (row.checklist as Checklist | null) ?? {},
  rejectionReason: (row.rejection_reason as string | null) ?? null,
  history: (row.history as HistoryEntry[] | null) ?? [],
  lastError: (row.last_error as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export const listApplications = async () => {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
};

/** Für die Zahl an „Anträge" in der Seitenleiste. */
export const countOpenApplications = async () => {
  const { count, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "inquiry"]);
  if (error) throw error;
  return count ?? 0;
};

export const getApplication = async (id: string) => {
  const { data, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as Record<string, unknown>) : null;
};

/** Löscht den Antrag bei uns; in Campai bleibt alles stehen. */
export const deleteApplication = async (id: string) => {
  const { error } = await createSupabaseAdminClient().from(TABLE).delete().eq("id", id);
  if (error) throw error;
};

export const insertApplication = async (
  data: ApplicationData,
  signatures: ApplicationSignatures,
) => {
  const { data: row, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .insert({
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
      submitted_data: data,
      data,
      signatures,
      history: [
        { at: new Date().toISOString(), by: null, type: "submitted" },
      ] satisfies HistoryEntry[],
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(row as Record<string, unknown>);
};

export type ApplicationPatch = {
  status?: ApplicationStatus;
  data?: ApplicationData;
  signatures?: null;
  /** Wird in den gespeicherten Stand gemischt, nicht ersetzt. */
  campai?: Partial<CampaiProgress>;
  /** Wird gemischt; `null` nimmt ein Häkchen zurück. */
  checklist?: Partial<Record<ChecklistStep, ChecklistEntry | null>>;
  rejectionReason?: string;
  lastError?: string | null;
  /** Kommt hinten an den Verlauf. */
  history?: Omit<HistoryEntry, "at">;
};

/**
 * Schreibt die Änderung auf den Stand von `current` und gibt den neuen Stand
 * zurück. Gleichzeitig arbeiten höchstens ein, zwei Leute aus dem Vorstand —
 * Lesen-Ändern-Schreiben reicht.
 */
export const updateApplication = async (
  current: MembershipApplication,
  patch: ApplicationPatch,
) => {
  const campai = patch.campai ? { ...current.campai, ...patch.campai } : undefined;
  let checklist: Checklist | undefined;
  if (patch.checklist) {
    checklist = { ...current.checklist };
    for (const [step, entry] of Object.entries(patch.checklist) as [ChecklistStep, ChecklistEntry | null][]) {
      if (entry) checklist[step] = entry;
      else delete checklist[step];
    }
  }
  const history = patch.history
    ? [...current.history, { at: new Date().toISOString(), ...patch.history }]
    : undefined;

  const { data: row, error } = await createSupabaseAdminClient()
    .from(TABLE)
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.data
        ? {
            data: patch.data,
            email: patch.data.email,
            first_name: patch.data.firstName,
            last_name: patch.data.lastName,
          }
        : {}),
      ...(patch.signatures === null ? { signatures: null } : {}),
      ...(campai ? { campai } : {}),
      ...(checklist ? { checklist } : {}),
      ...(patch.rejectionReason !== undefined
        ? { rejection_reason: patch.rejectionReason }
        : {}),
      ...(patch.lastError !== undefined ? { last_error: patch.lastError } : {}),
      ...(history ? { history } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(row as Record<string, unknown>);
};
