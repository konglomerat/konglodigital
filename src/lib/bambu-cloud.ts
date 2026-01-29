import mqtt from "mqtt";
import { unstable_cache } from "next/cache";

import { type BambuPrinter, type PrinterStatus } from "@/lib/bambu";

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
};

type PushStatus = {
  gcode_state?: string;
  gcode_file?: string;
  mc_percent?: string | number;
  print_error?: number | string;
  fail_reason?: string;
  command?: string;
};

const API_BASE = "https://api.bambulab.com";
const DEFAULT_MQTT_HOST = "us.mqtt.bambulab.com";

type TokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }
  return value;
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

  if (printError > 0 || pushStatus?.fail_reason) {
    return "error";
  }

  if (gcodeState?.includes("PAUSE") || taskState === "PAUSED") {
    return "paused";
  }

  if (gcodeState?.includes("RUN") || gcodeState === "PRINTING") {
    return "printing";
  }

  if (taskState === "PRINTING") {
    return "printing";
  }

  return "idle";
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

const requestJson = async <T>(url: string, token?: string, body?: unknown) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
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
    throw new Error(
      `BambuLab API request failed (${response.status}).${suffix}`,
    );
  }

  return (await response.json()) as T;
};

const getAccessToken = async () => {
  if (process.env.BAMBULAB_ACCESS_TOKEN) {
    return process.env.BAMBULAB_ACCESS_TOKEN;
  }

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const email = requiredEnv("BAMBULAB_EMAIL");
  const password = process.env.BAMBULAB_PASSWORD;
  const code = process.env.BAMBULAB_VERIFICATION_CODE;

  if (!password && !code) {
    throw new Error(
      "Provide BAMBULAB_ACCESS_TOKEN or BAMBULAB_PASSWORD/BAMBULAB_VERIFICATION_CODE.",
    );
  }

  const response = await requestJson<{
    accessToken?: string;
    expiresIn?: number;
  }>("/v1/user-service/user/login", "", {
    account: email,
    password: password ?? undefined,
    code: code ?? undefined,
  });

  if (!response.accessToken) {
    throw new Error("BambuLab login failed. Access token missing.");
  }

  const expiresInSeconds = response.expiresIn ?? 3600;
  tokenCache = {
    token: response.accessToken,
    expiresAt: Date.now() + Math.max(60, expiresInSeconds) * 1000,
  };

  return response.accessToken;
};

const getUid = async (token: string) => {
  if (process.env.BAMBULAB_UID) {
    return process.env.BAMBULAB_UID;
  }

  const response = await requestJson<{ uid?: string | number }>(
    "/v1/design-user-service/my/preference",
    token,
  );

  if (!response.uid) {
    throw new Error("Could not resolve BambuLab UID.");
  }

  return String(response.uid);
};

const getDevices = async (token: string) => {
  const response = await requestJson<{ devices?: DeviceBind[] }>(
    "/v1/iot-service/api/user/bind",
    token,
  );
  return response.devices ?? [];
};

const getPrintStatuses = async (token: string) => {
  const response = await requestJson<{ devices?: PrintStatus[] }>(
    "/v1/iot-service/api/user/print?force=true",
    token,
  );
  const entries = response.devices ?? [];
  return new Map(entries.map((device) => [device.dev_id, device]));
};

export const fetchPrintJobsFromCloud = async (
  limit = 20,
): Promise<PrintJob[]> => {
  const token = await getAccessToken();
  const response = await requestJson<{ hits?: TaskEntry[] }>(
    `/v1/user-service/my/tasks?limit=${limit}`,
    token,
  );

  const jobs = response.hits ?? [];
  return jobs.map((job) => ({
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
  }));
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
    const timeout = setTimeout(() => resolve(), 3000);

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

        statuses.set(match[1], parsed.print);
      } catch {
        // ignore malformed payloads
      }
    });

    client.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    client.on("end", () => {
      clearTimeout(timeout);
      resolve();
    });

    setTimeout(() => {
      client.end(true);
    }, 3000);
  });

  return statuses;
};

const fetchPrinterMetadata = async (token: string) => {
  const devices = await getDevices(token);
  return devices.map(toPrinterMetadata);
};

export const fetchPrinterMetadataCached = unstable_cache(
  async () => {
    const token = await getAccessToken();
    return fetchPrinterMetadata(token);
  },
  ["bambu-printer-metadata"],
  { revalidate: 300 },
);

const fetchPrinterStatuses = async (
  token: string,
  uid: string,
  deviceIds: string[],
) => {
  const printStatuses = await getPrintStatuses(token);
  let pushStatuses = new Map<string, PushStatus>();
  try {
    pushStatuses = await collectPushStatuses(token, uid, deviceIds);
  } catch {
    // MQTT failures fall back to HTTP-only status
  }
  return { printStatuses, pushStatuses };
};

export const fetchPrintersFromCloud = async (): Promise<BambuPrinter[]> => {
  const token = await getAccessToken();
  const uid = await getUid(token);
  const metadata = await fetchPrinterMetadataCached();
  const { printStatuses, pushStatuses } = await fetchPrinterStatuses(
    token,
    uid,
    metadata.map((device) => device.id),
  );

  return metadata.map((device) => {
    const printStatus = printStatuses.get(device.id);
    const pushStatus = pushStatuses.get(device.id);
    const online = printStatus?.dev_online ?? false;
    const progress =
      pushStatus?.mc_percent !== undefined
        ? toProgress(pushStatus.mc_percent)
        : typeof printStatus?.progress === "number"
          ? printStatus.progress
          : 0;
    const jobName = pushStatus?.gcode_file ?? printStatus?.task_name ?? "";

    return {
      id: device.id,
      name: device.name,
      model: device.model,
      serial: device.serial,
      status: normalizeStatus(online, pushStatus, printStatus?.task_status),
      progress,
      jobName: jobName || undefined,
      updatedAt: new Date().toISOString(),
    } satisfies BambuPrinter;
  });
};
