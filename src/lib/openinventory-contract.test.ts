import { describe, expect, it } from "vitest";
import { inventoryEditUrl, inventoryIdentifier, inventoryMediaUrl, toPublicInventoryResource, type InventoryResource, type InventoryMedia } from "./openinventory-contract";
const media = (id: string, mimeType = "image/jpeg", extra = {}): InventoryMedia => ({ id, resourceId: "resource-1", name: "untrusted.html", url: `/api/files/${id}`, mimeType, kind: mimeType.startsWith("video/") ? "video" : "image", position: 0, ...extra });
const resource = (extra = {}): InventoryResource => ({ id: "resource-1", name: "Werkzeug", type: "object", ...extra });
describe("public OpenInventory projection", () => {
  it("only publishes catalog fields, never internal data or source URLs", () => {
    const result = toPublicInventoryResource(resource({ notes: "private", createdBy: "admin", customFields: { secret: true }, valueCents: 100, media: [media("photo")] }));
    expect(result.name).toBe("Werkzeug");
    for (const privateField of ["notes", "createdBy", "customFields", "valueCents", "media"]) expect(result).not.toHaveProperty(privateField);
    expect(JSON.stringify(result)).not.toContain("/api/files/");
  });
  it("keeps cover first, auxiliary videos/posters out of gallery, and their associations intact", () => {
    const video = media("video", "video/mp4", { position: 1, previewMediaId: "preview", posterMediaId: "poster" });
    const preview = media("preview", "video/mp4");
    const poster = media("poster");
    const photo = media("photo");
    const result = toPublicInventoryResource(resource({ cover: photo, media: [video, preview, poster, photo] }));
    expect(result.images).toEqual([inventoryMediaUrl(photo), inventoryMediaUrl(video)]);
    expect(result.mediaPreviews?.[inventoryMediaUrl(video)]).toBe(inventoryMediaUrl(preview));
    expect(result.mediaPosters?.[inventoryMediaUrl(video)]).toBe(inventoryMediaUrl(poster));
    expect(inventoryMediaUrl(video)).toMatch(/\.mp4$/);
  });
  it("preserves polygon rings and point coordinate order, including altitude", () => {
    const ring = [[13, 51], [13.1, 51], [13.1, 51.1], [13, 51]];
    const result = toPublicInventoryResource(resource({ gpsAltitude: 120, mapFeatures: [{ id: "p", type: "point", layer: "location", coordinates: [13, 51] }, { id: "r", type: "polygon", layer: "rooms", coordinates: ring }] }));
    expect(result.mapFeatures).toEqual([{ id: "p", geometryType: "Point", layer: "location", description: undefined, point: [13, 51] }, { id: "r", geometryType: "Polygon", layer: "rooms", description: undefined, coordinates: ring }]);
    expect(result.gpsAltitude).toBe(120);
  });
  it("uses GPS when there are no features and encodes edit path segments", () => {
    expect(toPublicInventoryResource(resource({ gpsLatitude: 51, gpsLongitude: 13 })).mapFeatures?.[0]).toMatchObject({ geometryType: "Point", point: [13, 51] });
    expect(inventoryEditUrl("id?evil")).toBe("https://inventar.konglomerat.org/konglomerat/inventory/id%3Fevil/edit");
  });
});

describe("historical inventory identifiers", () => {
  it("decodes locale-rewritten umlaut paths and preserves already decoded aliases", () => {
    expect(inventoryIdentifier("tischkreiss%C3%A4ge-in-holzwerkstatt")).toBe("tischkreissäge-in-holzwerkstatt");
    expect(inventoryIdentifier("tischkreissäge-in-holzwerkstatt")).toBe("tischkreissäge-in-holzwerkstatt");
    expect(inventoryIdentifier("bad%identifier")).toBe("bad%identifier");
  });
});
