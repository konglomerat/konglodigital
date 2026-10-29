export type MaterialRequirement = { type: string; color: string; nozzle: number; source: "auto" | "ams" | "external" };
export const DEFAULT_MATERIAL: MaterialRequirement = { type: "PETG", color: "000000", nozzle: 0.4, source: "auto" };
export const MATERIAL_TYPES = ["PETG", "PLA", "ABS", "ASA", "TPU", "TPU-AMS", "PA", "PC"];
export type MaterialSlot = { id: number; source: "ams" | "external"; label: string; type: string; color: string;
  profile: string; present: boolean; loaded: boolean; extruder: number | null; nozzle: number | null; remaining: number | null };
export type MaterialInventory = { observedAt: string; confirmed: boolean; slots: MaterialSlot[]; nozzles: { extruder: number; diameter: number }[] };
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const number = (v: unknown): number | null => (typeof v === "number" || (typeof v === "string" && /^\d+(\.\d+)?$/.test(v))) && Number.isFinite(Number(v)) ? Number(v) : null;
const hex = (v: unknown): bigint | null => typeof v === "string" && /^[0-9a-f]{1,32}$/i.test(v) ? BigInt(`0x${v}`) : null;
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const bit = (v: bigint | null, n: number) => v !== null && (v & (BigInt(1) << BigInt(n))) !== BigInt(0);

export function parseMaterialRequirement(value: unknown): MaterialRequirement {
  const r = obj(value);
  if (!MATERIAL_TYPES.includes(String(r.type)) || typeof r.color !== "string" || !/^[0-9a-f]{6}$/i.test(r.color)
    || ![0.2, 0.4, 0.6, 0.8].includes(Number(r.nozzle)) || typeof r.nozzle !== "number"
    || !["auto", "ams", "external"].includes(String(r.source))) throw new Error("Material, Farbe, Düse oder Zuführung sind ungültig.");
  return { type: String(r.type), color: r.color.toUpperCase(), nozzle: r.nozzle, source: r.source as MaterialRequirement["source"] };
}

// Telemetry only: do not infer spool presence from a saved material label.
// Bambu Studio DevFilaSystem / DevExtruderSystem define these slot and nozzle IDs.
export function parseMaterialInventory(raw: unknown, model: string, observedAt: string, confirmed: boolean): MaterialInventory {
  const p = obj(raw), ams = obj(p.ams), device = obj(p.device);
  const dual = /^H2/i.test(model.replace(/Bambu\s*Lab\s*/i, "")) || list(obj(device.extruder).info).length > 1;
  const nozzles: MaterialInventory["nozzles"] = [];
  if (dual) {
    for (const value of list(obj(device.extruder).info)) {
      const e = obj(value), id = number(e.id), nozzleId = number(e.hnow), info = number(e.info);
      const nozzle = list(obj(device.nozzle).info).map(obj).find(n => number(n.id) === nozzleId);
      const diameter = number(nozzle?.diameter);
      if (id !== null && info !== null && (info & 8) !== 0 && diameter !== null) nozzles.push({ extruder: id, diameter });
    }
  } else {
    const diameter = number(p.nozzle_diameter);
    if (diameter !== null) nozzles.push({ extruder: 0, diameter });
  }
  const slots: MaterialSlot[] = [];
  const slot = (t: Obj, id: number, source: MaterialSlot["source"], label: string, present: boolean, loaded: boolean, extruder: number | null) => {
    const color = text(t.tray_color).toUpperCase();
    slots.push({ id, source, label, type: text(t.tray_type).toUpperCase(), color: /^[0-9A-F]{8}$/.test(color) && color.endsWith("FF") ? color.slice(0, 6) : "",
      profile: text(t.tray_info_idx), present, loaded, extruder,
      nozzle: nozzles.find(n => n.extruder === extruder)?.diameter ?? null,
      remaining: number(t.remain) });
  };
  for (const value of list(ams.ams)) {
    const unit = obj(value), unitId = number(unit.id), info = hex(unit.info);
    // Classic four-slot AMS/AMS Lite/AMS 2 Pro. Unknown topologies fail closed.
    if (unitId === null || !Number.isInteger(unitId) || unitId < 0 || unitId > 3) continue;
    const extruder = dual ? info === null ? null : Number((info >> BigInt(8)) & BigInt(15)) : 0;
    for (const value of list(unit.tray)) {
      const t = obj(value), tray = number(t.id);
      if (tray === null || !Number.isInteger(tray) || tray < 0 || tray > 3) continue;
      const id = unitId * 4 + tray;
      slot(t, id, "ams", `AMS ${unitId + 1} · Fach ${tray + 1}`, bit(hex(ams.ams_exist_bits), unitId) && bit(hex(ams.tray_exist_bits), id), !dual && number(ams.tray_now) === id, extruder);
    }
  }
  if (!dual && Object.keys(obj(p.vt_tray)).length) {
    const loaded = number(ams.tray_now) === 254 && number(p.hw_switch_state) === 1;
    slot(obj(p.vt_tray), 254, "external", "Externe Spule", loaded, loaded, 0);
  }
  return { observedAt, confirmed, slots, nozzles };
}

export function colorMatches(actual: string, wanted: string) {
  if (!/^[0-9A-F]{6}$/i.test(actual) || !/^[0-9A-F]{6}$/i.test(wanted)) return false;
  if (wanted.toUpperCase() !== "000000") return actual.toUpperCase() === wanted.toUpperCase();
  // Manufacturers also label near-black (e.g. 161616) as black; grey is excluded.
  const rgb = actual.match(/../g)!.map(c => parseInt(c, 16));
  return Math.max(...rgb) <= 32 && Math.max(...rgb) - Math.min(...rgb) <= 8;
}

export function selectMaterial(inventory: MaterialInventory | undefined, requirement: MaterialRequirement, now: number): { ready: boolean; message: string; slot?: MaterialSlot } {
  const time = Date.parse(inventory?.observedAt ?? "");
  if (!inventory?.confirmed || !Number.isFinite(time) || time > now + 2000 || now - time > 30_000)
    return { ready: false, message: "Aktuelle Material- und Düsendaten fehlen." };
  const candidates = inventory.slots.filter(s => s.type === requirement.type && colorMatches(s.color, requirement.color)
    && s.present && (s.source !== "external" || s.loaded) && s.nozzle === requirement.nozzle
    && (requirement.source === "auto" || s.source === requirement.source));
  candidates.sort((a, b) => Number(a.source === "external") - Number(b.source === "external") || Number(b.loaded) - Number(a.loaded) || a.id - b.id);
  const slot = candidates[0];
  return slot ? { ready: true, slot, message: `${slot.label} · ${slot.type} · #${slot.color} · ${requirement.nozzle.toLocaleString("de-DE")} mm` }
    : { ready: false, message: `Kein bestätigtes ${requirement.type} in der gewünschten Farbe mit ${requirement.nozzle.toLocaleString("de-DE")} mm Düse verfügbar.` };
}

// Merge objects only within one MQTT request. Arrays replace previous reports,
// so an empty tray cannot retain the previous spool's material metadata.
export function mergePrinterReport(previous: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergePrinterReport(obj(previous[key]), obj(value)) : value;
  }
  return merged;
}
