import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { AutomationError } from "./auth";
import { normalizePrinterModel } from "./decision";
import { MAX_TEMPLATE_BYTES } from "./types";
import type { MaterialRequirement, MaterialSlot } from "./material";

export function inspectPrintFile(bytes: Uint8Array, fileName: string, expectedModel: string, plate: number) {
  if (!fileName.toLowerCase().endsWith(".gcode.3mf") || !bytes.length || bytes.length > MAX_TEMPLATE_BYTES) {
    throw new AutomationError("Bitte eine geslicte .gcode.3mf-Datei mit höchstens 50 MB auswählen.");
  }
  if (!Number.isInteger(plate) || plate < 1 || plate > 100) throw new AutomationError("Ungültige Druckplatte.");
  const entries = new Set<string>();
  let expandedSize = 0;
  let plateFound = false;
  let settings: ReturnType<typeof unzipSync>;
  try {
    settings = unzipSync(bytes, { filter(entry) {
      if (entries.has(entry.name) || entries.size > 1000 || entry.name.includes("..") || entry.name.startsWith("/")) throw new Error("Invalid ZIP entries");
      entries.add(entry.name);
      expandedSize += entry.originalSize;
      if (expandedSize > 1024 * 1024 * 1024) throw new Error("Archive too large");
      if (entry.name === `Metadata/plate_${plate}.gcode` && entry.originalSize > 0) plateFound = true;
      const metadata = entry.name === "Metadata/project_settings.config";
      if (metadata && entry.originalSize > 1024 * 1024) throw new Error("Metadata too large");
      return metadata;
    } });
  } catch {
    throw new AutomationError("Die Druckdatei ist beschädigt oder ihr Archiv ist zu groß.");
  }
  if (!plateFound) throw new AutomationError(`Die Datei enthält keinen geslicten G-Code für Platte ${plate}.`);
  let model: string;
  try {
    const config = JSON.parse(strFromU8(settings["Metadata/project_settings.config"]));
    if (typeof config.printer_model !== "string" || !config.printer_model.trim()) throw new Error("Missing model");
    model = config.printer_model.trim();
  } catch {
    throw new AutomationError("Das Druckermodell fehlt in der Datei. Bitte in Bambu Studio neu slicen und als Druckdatei exportieren.");
  }
  if (normalizePrinterModel(model) !== normalizePrinterModel(expectedModel)) {
    throw new AutomationError(`Die Datei wurde für ${model} geslicet, nicht für ${expectedModel}.`);
  }
  return { model, plate, sha256: createHash("sha256").update(bytes).digest("hex") };
}

// A slot assignment cannot change temperatures, flow or tool paths in sliced G-code.
// Until plate/tool metadata is fully supported, accept only single-filament,
// single-extruder files with a matching preset ID, including Basic versus HF.
export function validatePrintMaterial(bytes: Uint8Array, fileName: string, model: string, plate: number,
  requirement: MaterialRequirement, slot: MaterialSlot) {
  inspectPrintFile(bytes, fileName, model, plate);
  const entries = unzipSync(bytes, { filter: entry => entry.name === "Metadata/project_settings.config" });
  const config = JSON.parse(strFromU8(entries["Metadata/project_settings.config"]));
  const types = config.filament_type, profiles = config.filament_ids, nozzles = config.nozzle_diameter;
  if (/^H2/.test(normalizePrinterModel(model)) || slot.extruder !== 0)
    return "Die Werkzeugzuordnung dieser Druckdatei mit mehreren Extrudern ist noch nicht unterstützt.";
  if (!Array.isArray(types) || types.length !== 1 || types[0] !== requirement.type)
    return "Die Druckdatei muss mit genau einem Filament des gewünschten Materials geslicet sein.";
  if (!Array.isArray(nozzles) || nozzles.length !== 1 || Number(nozzles[0]) !== requirement.nozzle)
    return "Die Düsengröße der geslicten Druckdatei passt nicht zur Materialvorgabe.";
  if (!slot.profile || !Array.isArray(profiles) || profiles.length !== 1 || profiles[0] !== slot.profile)
    return "Das Filamentprofil der Druckdatei passt nicht zur Spule (z. B. PETG Basic/HF). Bitte passend slicen.";
  return null;
}

export async function readLimitedBody(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new AutomationError("Datei fehlt.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new AutomationError("Datei ist zu groß.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
