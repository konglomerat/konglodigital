import { describe, expect, it } from "vitest";
import { getInventoryPlaceIdentifier } from "./inventory-place";

describe("inventory place references", () => {
  it("accepts inventory links including localized and absolute links", () => {
    expect(getInventoryPlaceIdentifier("/resources/laser-und-3d-druckwerkstatt")).toBe("laser-und-3d-druckwerkstatt");
    expect(getInventoryPlaceIdentifier("http://localhost:3000/en/resources/workshop/?view=map")).toBe("workshop");
  });
  it("leaves external maps and other routes as ordinary links", () => {
    for (const value of [null, "", "https://www.google.com/maps?q=51,13", "/resources", "/resources/workshop/edit", "javascript:alert(1)", "/resources/%broken"]) {
      expect(getInventoryPlaceIdentifier(value)).toBeNull();
    }
  });
});
