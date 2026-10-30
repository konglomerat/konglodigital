import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/campai-receipts/config", () => ({
  loadCampaiConfig: () => ({ apiKey: "k", baseUrl: "https://campai.test" }),
}));

import { unpauseAboForBonus } from "./ehrenamtsbonus-campai";

const RULE = "0QXfUXP9";
const contract = (pause: unknown) => ({
  _id: "c1",
  plan: { plan: "p1", name: "Abo Klein" },
  startAt: "2026-01-01T00:00:00.000Z",
  endAt: null,
  options: [],
  pause,
});

/** Fängt die Campai-Aufrufe ab und merkt sich, was am Vertrag geschrieben wurde. */
const stubCampai = (contracts: unknown[]) => {
  const writes: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const respond = (value: unknown) => new Response(JSON.stringify(value));
      if (url.endsWith("crm/contracts/list")) return respond({ contracts });
      if (url.includes("crm/plans/")) {
        return respond({ pauseRules: [{ id: RULE, name: "Ehrenamtsbonus" }] });
      }
      writes.push(body);
      return respond({});
    }),
  );
  return writes;
};

const bonusPause = {
  ruleId: RULE,
  startAt: "2027-01-01T00:00:00.000Z",
  endAt: "2027-03-31T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("unpauseAboForBonus", () => {
  it("nimmt die Pause ganz weg, wenn der Bonus noch nicht begonnen hat", async () => {
    const writes = stubCampai([contract(bonusPause)]);
    const result = await unpauseAboForBonus(
      "contact",
      "2027-01-01",
      "2026-12-15",
    );
    expect(result.contracts).toHaveLength(1);
    expect(writes).toEqual([expect.objectContaining({ pause: null })]);
  });

  it("lässt die Pause gestern enden, wenn der Bonus schon läuft", async () => {
    const writes = stubCampai([contract(bonusPause)]);
    await unpauseAboForBonus("contact", "2027-01-01", "2027-02-10");
    expect(writes).toEqual([
      expect.objectContaining({
        pause: {
          ruleId: RULE,
          startAt: "2027-01-01T00:00:00.000Z",
          endAt: "2027-02-09T00:00:00.000Z",
        },
      }),
    ]);
  });

  it("lässt fremde und vergangene Pausen in Ruhe", async () => {
    const writes = stubCampai([
      contract({ ...bonusPause, startAt: "2026-10-01T00:00:00.000Z" }),
      contract(null),
    ]);
    expect(
      (await unpauseAboForBonus("contact", "2027-01-01", "2026-12-15"))
        .contracts,
    ).toEqual([]);
    expect(writes).toEqual([]);
    const after = stubCampai([contract(bonusPause)]);
    await unpauseAboForBonus("contact", "2027-01-01", "2027-05-01");
    expect(after).toEqual([]);
  });
});
