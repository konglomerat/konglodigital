import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import mqtt from "mqtt";
import { unstable_cache } from "next/cache";

import { type BambuPrinter, type PrinterStatus } from "@/lib/bambu";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DeviceBind = {
  dev_id: string;
  name: string;
  online: boolean;
  dev_model_name?: string;
  dev_product_name?: string;
};

type PrinterMetadata = {
  id: string;
  name: string;
  model: string;
  serial: string;
};

type PrintStatus = {
  dev_id: string;
  dev_name?: string;
  dev_online?: boolean;
  progress?: number | null;
  task_name?: string | null;
  task_status?: string | null;
};

type TaskEntry = {
  id: number | string;
  title?: string;
  status?: number | string;
  deviceId?: string;
  deviceName?: string;
  startTime?: string;
  endTime?: string;
  costTime?: number;
  weight?: number;
  mode?: string;
  cover?: string;
  coverUrl?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  image?: string;
  pic?: string;
  preview?: string;
  thumb?: string;
  fileCover?: string;
  fileCoverUrl?: string;
  failedReason?: string;
  failReason?: string;
  errorMessage?: string;
  errorCode?: number | string;
  reason?: string;
};

export type PrintJob = {
  id: string;
  title: string;
  status: string;
  deviceId?: string;
  startTime?: string;
  endTime?: string;
  durationSeconds?: number;
  weightGrams?: number;
  mode?: string;
  imageUrl?: string;
  errorDetail?: string;
};

export type PrinterUsageStats = {
  deviceId: string;
  deviceName?: string;
  seconds: number;
  timedJobs: number;
};

export type PrintUsageStats = {
  totalSeconds: number;
  timedJobs: number;
  totalJobs: number;
  reportedTotalJobs: number;
  historyComplete: boolean;
  oldestStartTime?: string;
  byPrinter: PrinterUsageStats[];
};

type PushStatus = {
  gcode_state?: string;
  gcode_file?: string;
  mc_percent?: string | number;
  print_error?: number | string;
  fail_reason?: string;
  mc_remaining_time?: number | string;
  layer_num?: number | string;
  total_layer_num?: number | string;
  subtask_name?: string;
  command?: string;
};

const API_BASE = "https://api.bambulab.com";
const MAKERWORLD_BASE = "https://makerworld.com";
const DEFAULT_MQTT_HOST = "us.mqtt.bambulab.com";
const DEFAULT_TOKEN_STORE_PATH = ".data/bambulab-tokens.json";
const DEFAULT_TOKEN_STORE_BUCKET = "bambu-auth";
const DEFAULT_TOKEN_STORE_OBJECT = "tokens.json";
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const VERIFICATION_CODE_POLL_INTERVAL_MS = 3_000;
const VERIFICATION_CODE_TIMEOUT_MS = 120_000;
const PUSH_STATUS_CACHE_TTL_MS = 45_000;
const MQTT_STATUS_TIMEOUT_MS = 8_000;
const MQTT_RESPONSE_WINDOW_MS = 4_500;
const TASK_HISTORY_PAGE_SIZE = 100;
const TASK_HISTORY_BATCH_SIZE = 4;
const BAMBU_CLIENT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "bambu_network_agent/01.09.05.01",
  "X-BBL-Agent-OS-Type": "linux",
  "X-BBL-Agent-Version": "01.09.05.01",
  "X-BBL-Client-Name": "OrcaSlicer",
  "X-BBL-Client-Type": "slicer",
  "X-BBL-Client-Version": "01.09.05.51",
  "X-BBL-Executable-info": "{}",
  "X-BBL-Language": "en-US",
  "X-BBL-OS-Type": "linux",
  "X-BBL-OS-Version": "6.2.0",
};
const MAKERWORLD_CLIENT_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0",
  "X-BBL-App-Source": "makerworld",
  "X-BBL-Client-Name": "MakerWorld",
  "X-BBL-Client-Type": "web",
  "X-BBL-Client-Version": "00.00.00.01",
};

type TokenCache = {
  token: string;
  refreshToken?: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;
let storedTokensLoaded = false;
let renewalPromise: Promise<string> | null = null;
const pushStatusCache = new Map<
  string,
  { status: PushStatus; observedAt: number }
>();

type AuthResponse = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  token?: string;
  expireIn?: number;
  loginType?: string;
};

class BambuApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BambuApiError";
  }
}

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
};

const getFailReason = (value?: string) => {
  const normalized = value?.trim();
  if (
    !normalized ||
    ["0", "none", "null", "false", "ok"].includes(normalized.toLowerCase())
  ) {
    return undefined;
  }
  return normalized;
};

const normalizeStatus = (
  online: boolean,
  pushStatus?: PushStatus,
  taskStatus?: string | null,
): PrinterStatus => {
  if (!online) {
    return "offline";
  }

  const gcodeState = pushStatus?.gcode_state?.toUpperCase();
  const taskState = taskStatus?.toUpperCase();
  const printError = Number(pushStatus?.print_error ?? 0);
  const currentState = gcodeState ?? taskState;

  if (
    printError > 0 ||
    Boolean(getFailReason(pushStatus?.fail_reason)) ||
    ["FAILED", "FAILURE", "ERROR"].includes(currentState ?? "")
  ) {
    return "error";
  }

  if (["PAUSE", "PAUSED"].includes(currentState ?? "")) {
    return "paused";
  }

  if (
    [
      "RUNNING",
      "PRINTING",
      "PREPARE",
      "PREPARING",
      "SLICING",
    ].includes(currentState ?? "")
  ) {
    return "printing";
  }

  if (
    ["IDLE", "FINISH", "FINISHED", "SUCCESS", "COMPLETE", "COMPLETED"].includes(
      currentState ?? "",
    )
  ) {
    return "idle";
  }

  return "unknown";
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getPrintErrorCode = (value: PushStatus["print_error"]) => {
  const numeric = toOptionalNumber(value);
  if (!numeric || numeric <= 0) {
    return undefined;
  }
  return `0x${Math.trunc(numeric).toString(16).toUpperCase().padStart(8, "0")}`;
};

const getPrinterStatusDetail = (
  status: PrinterStatus,
  pushStatus?: PushStatus,
) => {
  if (status === "unknown") {
    return "Bambu Lab hat keinen eindeutigen aktuellen Betriebszustand geliefert.";
  }
  if (status !== "error") {
    return undefined;
  }

  const details = [
    getFailReason(pushStatus?.fail_reason),
    getPrintErrorCode(pushStatus?.print_error)
      ? `Fehlercode ${getPrintErrorCode(pushStatus?.print_error)}`
      : undefined,
  ].filter((value): value is string => Boolean(value));

  return details.length > 0
    ? details.join(" · ")
    : "Der Drucker meldet einen fehlgeschlagenen Druck, aber keinen genaueren Fehlergrund.";
};

const getTaskErrorDetail = (job: TaskEntry) => {
  const reason = [
    job.failedReason,
    job.failReason,
    job.errorMessage,
    job.reason,
  ].find((value) => typeof value === "string" && value.trim());
  const errorCode =
    job.errorCode !== undefined && String(job.errorCode).trim()
      ? `Fehlercode ${String(job.errorCode).trim()}`
      : undefined;

  return [reason?.trim(), errorCode]
    .filter((value): value is string => Boolean(value))
    .join(" · ") || undefined;
};

const toProgress = (value: PushStatus["mc_percent"]): number => {
  if (typeof value === "number") {
    return Math.max(0, Math.min(100, value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }
  return 0;
};

const toPrinterMetadata = (device: DeviceBind): PrinterMetadata => ({
  id: device.dev_id,
  name: device.name,
  model: device.dev_product_name ?? device.dev_model_name ?? "BambuLab",
  serial: device.dev_id,
});

const requestJsonFrom = async <T>(
  baseUrl: string,
  url: string,
  clientHeaders: Record<string, string>,
  token?: string,
  body?: unknown,
) => {
  const headers: Record<string, string> = {
    ...clientHeaders,
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    let details = "";
    try {
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            message?: string;
            error?: string;
          };
          details = parsed.message ?? parsed.error ?? text;
        } catch {
          details = text;
        }
      }
    } catch {
      // ignore error body parsing
    }

    const suffix = details ? ` ${details}` : "";
    throw new BambuApiError(
      `BambuLab API request failed (${response.status}).${suffix}`,
      response.status,
    );
  }

  const responseText = await response.text();
  if (!responseText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error("BambuLab API returned an invalid JSON response.");
  }
};

const requestJson = <T>(url: string, token?: string, body?: unknown) =>
  requestJsonFrom<T>(API_BASE, url, BAMBU_CLIENT_HEADERS, token, body);

const requestMakerWorldJson = <T>(
  url: string,
  token?: string,
  body?: unknown,
) =>
  requestJsonFrom<T>(
    MAKERWORLD_BASE,
    url,
    MAKERWORLD_CLIENT_HEADERS,
    token,
    body,
  );

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getTokenStorePath = () =>
  path.resolve(
    process.cwd(),
    process.env.BAMBULAB_TOKEN_STORE_PATH ?? DEFAULT_TOKEN_STORE_PATH,
  );

const parseStoredTokens = (raw: string): TokenCache => {
  const stored = JSON.parse(raw) as Partial<TokenCache>;
  if (
    typeof stored.token !== "string" ||
    stored.token.length === 0 ||
    typeof stored.expiresAt !== "number"
  ) {
    throw new Error("Stored Bambu Lab token data is invalid.");
  }

  return {
    token: stored.token,
    refreshToken:
      typeof stored.refreshToken === "string"
        ? stored.refreshToken
        : undefined,
    expiresAt: stored.expiresAt,
  };
};

const getRemoteTokenStore = () => {
  const bucket =
    process.env.BAMBULAB_TOKEN_STORE_BUCKET ?? DEFAULT_TOKEN_STORE_BUCKET;
  const objectPath =
    process.env.BAMBULAB_TOKEN_STORE_OBJECT ?? DEFAULT_TOKEN_STORE_OBJECT;

  if (!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket)) {
    throw new Error("BAMBULAB_TOKEN_STORE_BUCKET is invalid.");
  }
  if (
    !objectPath ||
    objectPath.startsWith("/") ||
    objectPath.split("/").includes("..")
  ) {
    throw new Error("BAMBULAB_TOKEN_STORE_OBJECT is invalid.");
  }

  return { bucket, objectPath };
};

type StorageErrorLike = {
  message?: string;
  status?: number | string;
  statusCode?: number | string;
};

const isMissingStorageResource = (error: unknown) => {
  const storageError = error as StorageErrorLike;
  const status = Number(storageError.statusCode ?? storageError.status);
  return (
    status === 404 ||
    /bucket not found|object not found|not found/i.test(
      storageError.message ?? "",
    )
  );
};

const loadRemoteTokens = async (): Promise<TokenCache | null> => {
  const { bucket, objectPath } = getRemoteTokenStore();
  const adminClient = createSupabaseAdminClient();
  const { data: bucketData, error: bucketError } =
    await adminClient.storage.getBucket(bucket);

  if (bucketError) {
    if (isMissingStorageResource(bucketError)) {
      return null;
    }
    throw bucketError;
  }
  if (bucketData.public) {
    throw new Error("Bambu Lab token storage bucket must be private.");
  }

  const { data, error } = await adminClient.storage
    .from(bucket)
    .download(objectPath);
  if (error) {
    if (isMissingStorageResource(error)) {
      return null;
    }
    throw error;
  }

  return parseStoredTokens(await data.text());
};

const loadFileTokens = async (): Promise<TokenCache | null> => {
  try {
    const raw = await fs.readFile(getTokenStorePath(), "utf8");
    return parseStoredTokens(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const loadStoredTokens = async () => {
  if (storedTokensLoaded) {
    return;
  }
  storedTokensLoaded = true;

  let remoteError: unknown;
  try {
    tokenCache = await loadRemoteTokens();
    if (tokenCache) {
      return;
    }
  } catch (error) {
    remoteError = error;
  }

  try {
    tokenCache = await loadFileTokens();
    if (tokenCache) {
      return;
    }
  } catch (error) {
    remoteError ??= error;
  }

  if (remoteError && !process.env.BAMBULAB_ACCESS_TOKEN) {
    throw remoteError;
  }
};

const persistFileTokens = async (tokens: TokenCache) => {
  const projectRoot = await fs.realpath(process.cwd());
  const storePath = getTokenStorePath();
  const storeDirectory = path.dirname(storePath);
  await fs.mkdir(storeDirectory, { recursive: true, mode: 0o700 });

  const resolvedDirectory = await fs.realpath(storeDirectory);
  const isInsideProject =
    resolvedDirectory === projectRoot ||
    resolvedDirectory.startsWith(`${projectRoot}${path.sep}`);
  if (!isInsideProject) {
    throw new Error(
      "BAMBULAB_TOKEN_STORE_PATH must resolve inside the project directory.",
    );
  }

  try {
    const existing = await fs.lstat(storePath);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new Error("Bambu Lab token store must be a regular file.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const temporaryPath = path.join(
    storeDirectory,
    `.${path.basename(storePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(tokens)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fs.rename(temporaryPath, storePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
};

const persistRemoteTokens = async (tokens: TokenCache) => {
  const { bucket, objectPath } = getRemoteTokenStore();
  const adminClient = createSupabaseAdminClient();
  const { data: bucketData, error: bucketError } =
    await adminClient.storage.getBucket(bucket);

  if (bucketError && !isMissingStorageResource(bucketError)) {
    throw bucketError;
  }
  if (bucketData?.public) {
    throw new Error("Bambu Lab token storage bucket must be private.");
  }

  if (!bucketData) {
    const { error: createError } = await adminClient.storage.createBucket(
      bucket,
      {
        public: false,
        allowedMimeTypes: ["application/json"],
        fileSizeLimit: 16 * 1024,
      },
    );
    if (createError && !/already exists/i.test(createError.message)) {
      throw createError;
    }
  }

  const { error } = await adminClient.storage.from(bucket).upload(
    objectPath,
    Buffer.from(`${JSON.stringify(tokens)}\n`),
    {
      cacheControl: "0",
      contentType: "application/json",
      upsert: true,
    },
  );
  if (error) {
    throw error;
  }
};

const persistTokens = async (tokens: TokenCache) => {
  const results = await Promise.allSettled([
    persistRemoteTokens(tokens),
    persistFileTokens(tokens),
  ]);
  if (results.every((result) => result.status === "rejected")) {
    const firstFailure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw firstFailure?.reason ?? new Error("Unable to persist Bambu tokens.");
  }
};

const cacheAndPersistAuth = async (auth: AuthResponse) => {
  const accessToken = auth.accessToken || auth.token;
  if (!accessToken) {
    throw new Error("BambuLab login failed. Access token missing.");
  }

  const expiresInSeconds = Math.max(
    60,
    auth.expiresIn ?? auth.expireIn ?? 3600,
  );
  const nextTokens: TokenCache = {
    token: accessToken,
    refreshToken: auth.refreshToken || accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  await persistTokens(nextTokens);
  tokenCache = nextTokens;
  return nextTokens.token;
};

const waitForVerificationCode = async (
  createdAfter: Date,
  account: string,
) => {
  const timeoutMs = parsePositiveInteger(
    process.env.BAMBULAB_VERIFICATION_TIMEOUT_MS,
    VERIFICATION_CODE_TIMEOUT_MS,
  );
  const deadline = Date.now() + timeoutMs;
  const adminClient = createSupabaseAdminClient();

  while (Date.now() < deadline) {
    const { data, error } = await adminClient
      .from("access_code_inbox")
      .select("access_code,created_at,subject,raw_payload")
      .gte("created_at", createdAfter.toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    const entry = (data ?? []).find(
      (candidate) =>
        typeof candidate.access_code === "string" &&
        candidate.access_code.trim().length > 0 &&
        /bambu/i.test(candidate.subject ?? "") &&
        JSON.stringify(candidate.raw_payload ?? {})
          .toLowerCase()
          .includes(account.trim().toLowerCase()),
    );
    if (entry) {
      return entry.access_code.trim();
    }

    await new Promise((resolve) =>
      setTimeout(resolve, VERIFICATION_CODE_POLL_INTERVAL_MS),
    );
  }

  throw new Error(
    "Timed out waiting for the Bambu Lab verification email.",
  );
};

const renewWithPassword = async () => {
  const account = requiredEnv("BAMBULAB_EMAIL");
  const password = requiredEnv("BAMBULAB_PASSWORD");
  let auth = await requestJson<AuthResponse>(
    "/v1/user-service/user/login",
    undefined,
    { account, password, apiError: "" },
  );

  if (!auth.accessToken && auth.loginType === "verifyCode") {
    const requestedAt = new Date(Date.now() - 5_000);
    await requestJson("/v1/user-service/user/sendemail/code", undefined, {
      email: account,
      type: "codeLogin",
    });
    const code = await waitForVerificationCode(requestedAt, account);
    auth = await requestJson<AuthResponse>(
      "/v1/user-service/user/login",
      undefined,
      { account, code },
    );
  }

  return cacheAndPersistAuth(auth);
};

const performRenewal = async () => {
  const refreshToken =
    tokenCache?.refreshToken ?? process.env.BAMBULAB_REFRESH_TOKEN;
  if (refreshToken) {
    try {
      const auth = await requestMakerWorldJson<AuthResponse>(
        "/api/v1/user-service/user/refreshtoken",
        undefined,
        { refreshToken },
      );
      if (auth.accessToken || auth.token) {
        return cacheAndPersistAuth(auth);
      }
    } catch {
      // Try the legacy cloud endpoint before falling back to a full login.
    }

    try {
      const auth = await requestJson<AuthResponse>(
        "/v1/user-service/user/refreshtoken",
        undefined,
        { refreshToken },
      );
      if (auth.accessToken || auth.token) {
        return cacheAndPersistAuth(auth);
      }
    } catch {
      // Bambu Lab currently rejects many refresh tokens. Fall back to login.
    }
  }

  return renewWithPassword();
};

const renewAccessToken = async (rejectedToken?: string) => {
  if (
    rejectedToken &&
    tokenCache &&
    tokenCache.token !== rejectedToken &&
    Date.now() + TOKEN_EXPIRY_SKEW_MS < tokenCache.expiresAt
  ) {
    return tokenCache.token;
  }

  if (!renewalPromise) {
    renewalPromise = performRenewal().finally(() => {
      renewalPromise = null;
    });
  }
  return renewalPromise;
};

const getAccessToken = async () => {
  await loadStoredTokens();

  if (
    tokenCache &&
    Date.now() + TOKEN_EXPIRY_SKEW_MS < tokenCache.expiresAt
  ) {
    return tokenCache.token;
  }

  if (!tokenCache && process.env.BAMBULAB_ACCESS_TOKEN) {
    tokenCache = {
      token: process.env.BAMBULAB_ACCESS_TOKEN,
      refreshToken: process.env.BAMBULAB_REFRESH_TOKEN,
      expiresAt: Number.POSITIVE_INFINITY,
    };
    return tokenCache.token;
  }

  return renewAccessToken();
};

const requestJsonAuthenticated = async <T>(url: string, body?: unknown) => {
  const token = await getAccessToken();
  try {
    return await requestJson<T>(url, token, body);
  } catch (error) {
    if (!(error instanceof BambuApiError) || error.status !== 401) {
      throw error;
    }
  }

  const renewedToken = await renewAccessToken(token);
  return requestJson<T>(url, renewedToken, body);
};

const getUid = async () => {
  if (process.env.BAMBULAB_UID) {
    return process.env.BAMBULAB_UID;
  }

  const response = await requestJsonAuthenticated<{ uid?: string | number }>(
    "/v1/design-user-service/my/preference",
  );

  if (!response.uid) {
    throw new Error("Could not resolve BambuLab UID.");
  }

  return String(response.uid);
};

const getDevices = async () => {
  const response = await requestJsonAuthenticated<{ devices?: DeviceBind[] }>(
    "/v1/iot-service/api/user/bind",
  );
  return response.devices ?? [];
};

const getPrintStatuses = async () => {
  const response = await requestJsonAuthenticated<{ devices?: PrintStatus[] }>(
    "/v1/iot-service/api/user/print?force=true",
  );
  const entries = response.devices ?? [];
  return new Map(entries.map((device) => [device.dev_id, device]));
};

type TaskListResponse = {
  total?: number;
  hits?: TaskEntry[];
};

const normalizeTaskLimit = (limit: number) =>
  Math.min(100, Math.max(1, Math.round(limit)));

const fetchTaskPage = async (limit: number, offset = 0) =>
  requestJsonAuthenticated<TaskListResponse>(
    `/v1/user-service/my/tasks?limit=${normalizeTaskLimit(limit)}&offset=${Math.max(0, Math.round(offset))}`,
  );

const toPrintJob = (job: TaskEntry): PrintJob => ({
  id: String(job.id ?? ""),
  title: job.title ?? "Untitled",
  status: job.status !== undefined ? String(job.status) : "unknown",
  deviceId: job.deviceId,
  startTime: job.startTime,
  endTime: job.endTime,
  durationSeconds: job.costTime ?? undefined,
  weightGrams: job.weight ?? undefined,
  mode: job.mode ?? undefined,
  imageUrl:
    job.cover ??
    job.coverUrl ??
    job.thumbnail ??
    job.thumbnailUrl ??
    job.image ??
    job.pic ??
    job.preview ??
    job.thumb ??
    job.fileCover ??
    job.fileCoverUrl ??
    undefined,
  errorDetail: getTaskErrorDetail(job),
});

const getTaskStatusKind = (status?: number | string) => {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "1" || normalized === "printing") {
    return "printing";
  }
  if (
    ["3", "4", "failed", "error", "canceled", "cancelled", "aborted"].includes(
      normalized,
    )
  ) {
    return "failed";
  }
  if (normalized === "2" || normalized === "success") {
    return "success";
  }
  return "unknown";
};

const toPositiveSeconds = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;

const getElapsedSeconds = (startTime?: string, endTime?: string) => {
  if (!startTime || !endTime) {
    return undefined;
  }
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return undefined;
  }
  return Math.round((endMs - startMs) / 1_000);
};

const getTaskOperatingSeconds = (task: TaskEntry, nowMs: number) => {
  const plannedSeconds = toPositiveSeconds(task.costTime);
  const statusKind = getTaskStatusKind(task.status);

  if (statusKind === "printing" && task.startTime) {
    const startMs = Date.parse(task.startTime);
    if (Number.isFinite(startMs) && startMs < nowMs) {
      return Math.round((nowMs - startMs) / 1_000);
    }
  }

  const elapsedSeconds = getElapsedSeconds(task.startTime, task.endTime);
  if (statusKind === "failed") {
    return elapsedSeconds ?? plannedSeconds;
  }
  return plannedSeconds ?? elapsedSeconds;
};

const buildPrintUsageStats = (
  tasks: TaskEntry[],
  reportedTotalJobs: number,
  historyComplete: boolean,
): PrintUsageStats => {
  const nowMs = Date.now();
  const usageByPrinter = new Map<string, PrinterUsageStats>();
  let totalSeconds = 0;
  let timedJobs = 0;
  let oldestStartTime: string | undefined;

  tasks.forEach((task) => {
    if (task.startTime) {
      const startMs = Date.parse(task.startTime);
      if (
        Number.isFinite(startMs) &&
        (!oldestStartTime || startMs < Date.parse(oldestStartTime))
      ) {
        oldestStartTime = task.startTime;
      }
    }

    const seconds = getTaskOperatingSeconds(task, nowMs);
    if (!seconds) {
      return;
    }

    totalSeconds += seconds;
    timedJobs += 1;
    if (!task.deviceId) {
      return;
    }

    const current = usageByPrinter.get(task.deviceId) ?? {
      deviceId: task.deviceId,
      deviceName: task.deviceName,
      seconds: 0,
      timedJobs: 0,
    };
    current.seconds += seconds;
    current.timedJobs += 1;
    current.deviceName ||= task.deviceName;
    usageByPrinter.set(task.deviceId, current);
  });

  return {
    totalSeconds,
    timedJobs,
    totalJobs: tasks.length,
    reportedTotalJobs,
    historyComplete,
    oldestStartTime,
    byPrinter: Array.from(usageByPrinter.values()).sort(
      (left, right) => right.seconds - left.seconds,
    ),
  };
};

const deduplicateTasks = (tasks: TaskEntry[]) =>
  Array.from(new Map(tasks.map((task) => [String(task.id), task])).values());

export const fetchPrintJobsFromCloud = async (
  limit = 20,
): Promise<PrintJob[]> => {
  const response = await fetchTaskPage(limit);
  return (response.hits ?? []).map(toPrintJob);
};

export const fetchPrintJobsAndUsageFromCloud = async (recentLimit = 20) => {
  const firstPage = await fetchTaskPage(TASK_HISTORY_PAGE_SIZE);
  const firstTasks = firstPage.hits ?? [];
  const reportedTotalJobs = Math.max(
    firstTasks.length,
    Math.round(firstPage.total ?? firstTasks.length),
  );
  if (firstTasks.length === 0) {
    return {
      jobs: [],
      usageStats: buildPrintUsageStats(
        [],
        reportedTotalJobs,
        reportedTotalJobs === 0,
      ),
    };
  }
  const effectivePageSize = Math.max(1, firstTasks.length);
  const offsets: number[] = [];
  for (
    let offset = effectivePageSize;
    offset < reportedTotalJobs;
    offset += effectivePageSize
  ) {
    offsets.push(offset);
  }

  const allTasks = [...firstTasks];
  let pageFailed = false;
  for (let index = 0; index < offsets.length; index += TASK_HISTORY_BATCH_SIZE) {
    const batch = offsets.slice(index, index + TASK_HISTORY_BATCH_SIZE);
    const pages = await Promise.allSettled(
      batch.map((offset) => fetchTaskPage(effectivePageSize, offset)),
    );
    pages.forEach((page) => {
      if (page.status === "fulfilled") {
        allTasks.push(...(page.value.hits ?? []));
      } else {
        pageFailed = true;
      }
    });
  }

  const uniqueTasks = deduplicateTasks(allTasks);
  const historyComplete =
    !pageFailed && uniqueTasks.length >= reportedTotalJobs;
  return {
    jobs: firstTasks.slice(0, normalizeTaskLimit(recentLimit)).map(toPrintJob),
    usageStats: buildPrintUsageStats(
      uniqueTasks,
      reportedTotalJobs,
      historyComplete,
    ),
  };
};

const collectPushStatuses = async (
  token: string,
  uid: string,
  deviceIds: string[],
) => {
  const host = process.env.BAMBULAB_MQTT_HOST ?? DEFAULT_MQTT_HOST;
  const username = `u_${uid}`;

  const client = mqtt.connect(`mqtts://${host}:8883`, {
    username,
    password: token,
    rejectUnauthorized: true,
    keepalive: 30,
  });

  const statuses = new Map<string, PushStatus>();
  const sequenceId = Date.now().toString();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let responseTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(hardTimeout);
      if (responseTimer) {
        clearTimeout(responseTimer);
      }
      client.end(true);
      if (error && statuses.size === 0) {
        reject(error);
      } else {
        resolve();
      }
    };

    const hardTimeout = setTimeout(() => finish(), MQTT_STATUS_TIMEOUT_MS);

    client.on("connect", () => {
      deviceIds.forEach((deviceId) => {
        client.subscribe(`device/${deviceId}/report`, { qos: 0 });
        client.publish(
          `device/${deviceId}/request`,
          JSON.stringify({
            pushing: {
              sequence_id: sequenceId,
              command: "pushall",
              version: 1,
              push_target: 1,
            },
          }),
          { qos: 0 },
        );
      });
      responseTimer = setTimeout(() => finish(), MQTT_RESPONSE_WINDOW_MS);
    });

    client.on("message", (topic, payload) => {
      const match = topic.match(/^device\/(.+)\/report$/);
      if (!match) {
        return;
      }

      try {
        const parsed = JSON.parse(payload.toString()) as { print?: PushStatus };
        if (!parsed.print) {
          return;
        }

        if (parsed.print.command && parsed.print.command !== "push_status") {
          return;
        }

        statuses.set(match[1], {
          ...statuses.get(match[1]),
          ...parsed.print,
        });
        if (statuses.size === deviceIds.length) {
          finish();
        }
      } catch {
        // ignore malformed payloads
      }
    });

    client.on("error", (error) => {
      finish(error);
    });
  });

  return statuses;
};

const fetchPrinterMetadata = async () => {
  const devices = await getDevices();
  return devices.map(toPrinterMetadata);
};

export const fetchPrinterMetadataCached = unstable_cache(
  async () => fetchPrinterMetadata(),
  ["bambu-printer-metadata"],
  { revalidate: 300 },
);

const fetchPrinterStatuses = async (
  uid: string,
  deviceIds: string[],
) => {
  const printStatuses = await getPrintStatuses();
  let pushStatuses = new Map<string, PushStatus>();
  try {
    const token = await getAccessToken();
    pushStatuses = await collectPushStatuses(token, uid, deviceIds);
  } catch {
    // MQTT failures fall back to HTTP-only status
  }
  return { printStatuses, pushStatuses };
};

export const fetchPrintersFromCloud = async (): Promise<BambuPrinter[]> => {
  const uid = await getUid();
  const metadata = await fetchPrinterMetadataCached();
  const { printStatuses, pushStatuses } = await fetchPrinterStatuses(
    uid,
    metadata.map((device) => device.id),
  );

  const now = Date.now();
  pushStatuses.forEach((status, deviceId) => {
    pushStatusCache.set(deviceId, { status, observedAt: now });
  });
  pushStatusCache.forEach((entry, deviceId) => {
    if (now - entry.observedAt > PUSH_STATUS_CACHE_TTL_MS) {
      pushStatusCache.delete(deviceId);
    }
  });

  return metadata.map((device) => {
    const printStatus = printStatuses.get(device.id);
    const freshPushStatus = pushStatuses.get(device.id);
    const cachedPushStatus = pushStatusCache.get(device.id);
    const canUseCachedStatus = printStatus?.dev_online !== false;
    const pushStatus =
      freshPushStatus ??
      (canUseCachedStatus ? cachedPushStatus?.status : undefined);
    const statusObservedAt = freshPushStatus
      ? now
      : pushStatus
        ? (cachedPushStatus?.observedAt ?? now)
        : now;
    const online = Boolean(pushStatus) || printStatus?.dev_online === true;
    const status = normalizeStatus(
      online,
      pushStatus,
      printStatus?.task_status,
    );
    const reportedProgress =
      pushStatus?.mc_percent !== undefined
        ? toProgress(pushStatus.mc_percent)
        : typeof printStatus?.progress === "number"
          ? printStatus.progress
          : 0;
    const hasActiveJob = ["printing", "paused", "error"].includes(status);
    const progress = hasActiveJob ? reportedProgress : 0;
    const jobName =
      pushStatus?.subtask_name ??
      printStatus?.task_name ??
      pushStatus?.gcode_file ??
      "";
    const currentLayer = toOptionalNumber(pushStatus?.layer_num);
    const totalLayers = toOptionalNumber(pushStatus?.total_layer_num);
    const remainingMinutes = toOptionalNumber(
      pushStatus?.mc_remaining_time,
    );

    return {
      id: device.id,
      name: device.name,
      model: device.model,
      serial: device.serial,
      status,
      progress,
      jobName: hasActiveJob && jobName ? jobName : undefined,
      statusDetail: getPrinterStatusDetail(status, pushStatus),
      rawStatus:
        pushStatus?.gcode_state?.toUpperCase() ??
        printStatus?.task_status?.toUpperCase(),
      remainingMinutes:
        hasActiveJob && remainingMinutes !== undefined
          ? Math.max(0, Math.round(remainingMinutes))
          : undefined,
      currentLayer:
        hasActiveJob && currentLayer !== undefined
          ? Math.max(0, Math.round(currentLayer))
          : undefined,
      totalLayers:
        hasActiveJob && totalLayers !== undefined
          ? Math.max(0, Math.round(totalLayers))
          : undefined,
      statusSource: pushStatus
        ? "live"
        : printStatus
          ? "cloud"
          : "unavailable",
      statusObservedAt: new Date(statusObservedAt).toISOString(),
      statusStale: Boolean(pushStatus && !freshPushStatus),
      updatedAt: new Date(now).toISOString(),
    } satisfies BambuPrinter;
  });
};
