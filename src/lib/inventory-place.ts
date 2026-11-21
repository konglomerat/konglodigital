/** A contact block can use an inventory detail link as its map source. */
export function getInventoryPlaceIdentifier(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), "https://inventory.local");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const match = url.pathname.match(/^\/(?:de\/|en\/)?resources\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
