import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { AutomationError } from "./auth";
import { readLimitedBody } from "./templates";
import type { BridgePrinter, PrintTemplate } from "./types";
import { saveLastPrinterPhoto } from "./local-state";

import type { MaterialRequirement, MaterialSlot } from "./material";

import { getCameraCloudCredentials } from "@/lib/bambu-cloud";

function bridgeConfig() {
  const raw = process.env.PRINTER_BRIDGE_URL;
  const token = process.env.PRINTER_BRIDGE_TOKEN;
  if (!raw || !token || token.length < 32) throw new AutomationError("Der Drucker-Dienst ist noch nicht eingerichtet.", 503);
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new AutomationError("Der Drucker-Dienst benötigt HTTPS oder eine lokale Loopback-Verbindung.", 503);
  }
  return { url, token };
}

async function bridgeRequest(endpoint: string, init?: RequestInit, timeout = 15_000) {
  const { url, token } = bridgeConfig();
  const response = await fetch(`${url.toString().replace(/\/$/, "")}${endpoint}`, {
    ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    const details = await readLimitedBody(response.body, 4096).then(body => JSON.parse(body.toString())).catch(() => null);
    if (details?.code === "LIGHT_UNCONFIRMED") throw new AutomationError("Die Druckerbeleuchtung konnte nicht als eingeschaltet bestätigt werden. Es wurde kein neues Foto aufgenommen.", 503);
    throw new AutomationError(`Drucker-Dienst meldet Fehler ${response.status}.`, 503);
  }
  return response;
}

export async function getBridgeHealth(): Promise<{ connected: boolean; printers: BridgePrinter[]; message: string }> {
  try {
    const response = await bridgeRequest("/v1/health", undefined, 5_000);
    const data = JSON.parse((await readLimitedBody(response.body, 32_768)).toString());
    if (data.version !== 1 || !Array.isArray(data.printers)) throw new Error("Invalid bridge health");
    const printers: BridgePrinter[] = data.printers.filter((p: BridgePrinter) => p && typeof p.id === "string")
      .map((p: BridgePrinter) => ({ id: p.id, camera: p.camera === true, canStart: p.canStart === true }));
    return { connected: true, printers, message: "Drucker-Dienst verbunden" };
  } catch {
    return { connected: false, printers: [], message: "Drucker-Dienst nicht eingerichtet oder nicht erreichbar. Die Automatik startet keinen Druck." };
  }
}

export async function capturePrinterImage(printerId: string) {
  const nonce = randomUUID();
  const requestedAt = Date.now();
  const credentials = process.env.PRINTER_BRIDGE_FORWARD_CLOUD_LOGIN === "true" ? await getCameraCloudCredentials() : undefined;
  const response = await bridgeRequest(`/v1/printers/${encodeURIComponent(printerId)}/snapshot?nonce=${nonce}`, credentials ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credentials }),
  } : undefined, 95_000);
  const capturedAt = response.headers.get("x-captured-at") ?? "";
  const capturedMs = Date.parse(capturedAt);
  if (response.headers.get("x-capture-nonce") !== nonce || response.headers.get("x-printer-id") !== printerId
    || !Number.isFinite(capturedMs) || capturedMs < requestedAt - 2_000 || capturedMs > Date.now() + 2_000
    || !response.headers.get("content-type")?.startsWith("image/jpeg")) {
    throw new AutomationError("Die Kamera liefert kein nachweislich aktuelles Bild dieses Druckers.", 503);
  }
  const raw = await readLimitedBody(response.body, 4 * 1024 * 1024);
  const metadata = await sharp(raw, { limitInputPixels: 12_000_000 }).metadata();
  if ((metadata.width ?? 0) < 320 || (metadata.height ?? 0) < 240) {
    throw new AutomationError("Das Kamerabild ist zu klein für eine Druckbettprüfung.", 503);
  }
  const jpeg = await sharp(raw, { limitInputPixels: 12_000_000 }).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  // Display cache only: a cache failure must not replace or invalidate the fresh capture.
  await saveLastPrinterPhoto(printerId, jpeg, capturedAt, "camera-service").catch(() => {
    console.error("Last printer photo could not be saved");
  });
  return { jpeg, capturedAt, hash: createHash("sha256").update(raw).digest("hex") };
}

export async function dispatchPrint(runId: string, template: PrintTemplate, file: Buffer, imageCapturedAt: string, material: { requirement: MaterialRequirement; slot: MaterialSlot; observedAt: string }) {
  if (createHash("sha256").update(file).digest("hex") !== template.sha256) throw new Error("Template integrity mismatch");
  const response = await bridgeRequest(`/v1/printers/${encodeURIComponent(template.printer_id)}/start`, {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": runId },
    body: JSON.stringify({ runId, file: file.toString("base64"), sha256: template.sha256,
      model: template.model, plate: template.plate, useAms: material.slot.source === "ams",
      amsMapping: material.slot.source === "ams" ? [material.slot.id] : [], material, imageCapturedAt }),
  }, 25_000);
  const result = JSON.parse((await readLimitedBody(response.body, 16_384)).toString());
  if (result.runId !== runId || !["accepted", "rejected", "unknown"].includes(result.state)) throw new Error("Invalid dispatch receipt");
  return result.state as "accepted" | "rejected" | "unknown";
}
