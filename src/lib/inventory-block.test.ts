import { describe, expect, it } from "vitest";
import { selectInventoryItems, type InventoryBlockRow } from "./inventory-block";
const row = (overrides: Partial<InventoryBlockRow> = {}): InventoryBlockRow => ({ id: "printer", name: "Drucker", pretty_title: "drucker", tags: ["3ddrucker"], type: "tool", is_private: false, image: null, images: ["https://example.org/printer.jpg"], ...overrides });
describe("CMS inventory selection", () => {
  it("matches complete tags without mixing curated and broad tags", () => {
    expect(selectInventoryItems([row(), row({id:"accessory",tags:["3d-drucker"]})], "3ddrucker").map(item=>item.id)).toEqual(["printer"]);
    expect(selectInventoryItems([row({tags:[" 3DDRUCKER "]})], "3ddrucker")).toHaveLength(1);
  });
  it("does not show private resources, showcase projects or all inventory for an empty tag", () => {
    expect(selectInventoryItems([row({is_private:true}),row({type:"PROJECT"})],"3ddrucker")).toEqual([]);
    expect(selectInventoryItems([row()],"--- ")).toEqual([]);
  });
  it("prefers the cover and falls back to a real photo, never a video", () => {
    expect(selectInventoryItems([row({image:"https://example.org/cover.png"})],"3ddrucker")[0].image).toContain("cover.png");
    expect(selectInventoryItems([row({image:"https://example.org/video.mp4"})],"3ddrucker")[0].image).toContain("printer.jpg");
    expect(selectInventoryItems([row({images:[]})],"3ddrucker")[0].image).toBeNull();
  });
  it("selects only explicitly public showcase projects with the complete tag", () => {
    const rows = [
      row({id:"vase",type:"project",tags:["3D-Druck"]}),
      row({id:"private",type:"project",tags:["3d-druck"],is_private:true}),
      row({id:"legacy",type:"project",tags:["3d-druck"],is_private:null}),
      row({id:"printer",type:"tool",tags:["3d-druck"]}),
      row({id:"other",type:"project",tags:["3d-drucker"]}),
    ];
    expect(selectInventoryItems(rows," 3d-druck ","showcase").map(item=>item.id)).toEqual(["vase"]);
    expect(selectInventoryItems(rows,"","showcase")).toEqual([]);
    expect(selectInventoryItems(rows,"laser","showcase")).toEqual([]);
  });
  it("uses a stored video poster when a project has no photos", () => {
    const videoProject = row({type:"project",tags:["laser"],image:"https://example.org/laser.mov",images:[],media_posters:{"https://example.org/laser.mov":"https://example.org/poster.jpg"}});
    expect(selectInventoryItems([videoProject],"laser","showcase")[0].image).toBe("https://example.org/poster.jpg");
    expect(selectInventoryItems([{...videoProject,media_posters:null}],"laser","showcase")[0].image).toBeNull();
  });
});
