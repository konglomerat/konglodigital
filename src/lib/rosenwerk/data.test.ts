import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  select: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => db,
}));
import { loadMapInventory } from "./data";
beforeEach(() => {
  vi.clearAllMocks();
  db.from.mockReturnValue(db);
  db.select.mockReturnValue(db);
  db.or.mockReturnValue(db);
  db.order.mockReturnValue(db);
});
it("paginates public inventory and strips private and off-site rows even if returned", async () => {
  const row = {
    id: "test",
    name: "Raum",
    type: "place",
    gps_longitude: 13.7157,
    gps_latitude: 51.0463,
  };
  db.range
    .mockResolvedValueOnce({
      data: Array.from({ length: 500 }, (_, i) => ({ ...row, id: String(i) })),
      error: null,
    })
    .mockResolvedValueOnce({
      data: [
        { ...row, id: "private", is_private: true },
        { ...row, id: "offsite", gps_latitude: 52 },
        { ...row, id: "last" },
      ],
      error: null,
    });
  const result = await loadMapInventory();
  expect(result.unavailable).toBe(false);
  expect(result.items).toHaveLength(501);
  expect(db.or).toHaveBeenCalledWith("is_private.is.null,is_private.eq.false");
  expect(db.range).toHaveBeenNthCalledWith(2, 500, 999);
  expect(
    result.items.some((i) => i.id === "private" || i.id === "offsite"),
  ).toBe(false);
});
it("moves unlinked equipment with a uniquely mapped room and preserves explicit associations", async () => {
  const lab = "253eb4ca-8e8d-42d7-85f4-7132dfe969be";
  const store = "08751840-b354-4566-b172-9f4df039f0f2";
  const object = {
    id: "enlarger",
    name: "Vergrößerer",
    type: "object",
    gps_longitude: 13.7154,
    gps_latitude: 51.0462,
  };
  const room = {
    id: lab,
    name: "Fotolabor",
    type: "place",
    map_features: [
      {
        geometryType: "Polygon",
        coordinates: [
          [13.7153, 51.04615],
          [13.7155, 51.04615],
          [13.7155, 51.04625],
          [13.7153, 51.04625],
        ],
      },
    ],
  };
  const equipment = { ...object, id: "reel", workshop_resource_id: store };
  db.range.mockResolvedValueOnce({
    data: [object, equipment, room],
    error: null,
  });
  const clear = (await loadMapInventory()).items;
  expect(clear.find((i) => i.id === object.id)?.level).toBe(-1);
  expect(clear.find((i) => i.id === equipment.id)?.level).toBe(1);
  db.range.mockResolvedValueOnce({
    data: [object, equipment, room, { ...room, id: "ground-floor-room" }],
    error: null,
  });
  const overlapping = (await loadMapInventory()).items;
  expect(overlapping.find((i) => i.id === object.id)?.level).toBe(0);
  expect(overlapping.find((i) => i.id === equipment.id)?.level).toBe(1);
});

it("returns an explicit unavailable state without exposing database errors", async () => {
  db.range.mockResolvedValue({
    data: null,
    error: new Error("private database detail"),
  });
  expect(await loadMapInventory()).toEqual({ items: [], unavailable: true });
});
