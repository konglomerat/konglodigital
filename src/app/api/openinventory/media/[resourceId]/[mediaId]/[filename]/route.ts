import type { NextRequest } from "next/server";
import { hasInventoryViewer } from "@/lib/openinventory-viewer";
import { InventoryApiError, inventoryFetch, inventoryRawResource } from "@/lib/openinventory";
export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: NextRequest, context: { params: Promise<{ resourceId: string; mediaId: string; filename: string }> }) {
  if (!await hasInventoryViewer(request)) return new Response(null, { status: 401 });
  const { resourceId, mediaId } = await context.params;
  if (!uuid.test(resourceId) || !uuid.test(mediaId)) return new Response(null, { status: 404 });
  try {
    const resource = await inventoryRawResource(resourceId);
    const media = [...(resource.media ?? []), ...(resource.cover ? [resource.cover] : [])].find(item => item.id === mediaId && item.resourceId === resourceId);
    if (!media || !/^(image\/(jpeg|png|gif|webp|avif)|video\/(mp4|webm|quicktime)|application\/pdf)$/.test(media.mimeType)) return new Response(null, { status: 404 });
    // Resolve only files attached to this resource. Never accept a client URL or
    // forward credentials to external media hosts/redirects.
    if (!media.url.startsWith("/api/files/") || /[\\?#]/.test(media.url) || decodeURIComponent(media.url).includes("..")) return new Response(null, { status: 404 });
    const width = new URL(request.url).searchParams.get("w");
    if (width && !["96", "192", "384", "640", "960", "1280", "1600"].includes(width)) return new Response(null, { status: 400 });
    const path = width && media.kind === "image" ? `/api/v1/media/${media.id}/thumbnail/contain/${width}` : media.url;
    const upstream = await inventoryFetch(path, request.headers.has("range") ? { Range: request.headers.get("range")! } : {});
    const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    if (![200, 206, 416].includes(upstream.status)) return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) { return new Response(null, { status: error instanceof InventoryApiError && error.status === 404 ? 404 : 502 }); }
}
