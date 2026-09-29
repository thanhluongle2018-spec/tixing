import { describe, expect, it } from "vitest";
import { filterNewListings, listingDedupeKey } from "./dedup.js";

describe("dedup", () => {
  it("builds stable keys", () => {
    expect(listingDedupeKey({ platform: "demo", externalId: "a1" })).toBe("demo::a1");
  });

  it("filters already-seen and in-batch duplicates", () => {
    const existing = new Set(["demo::1"]);
    const result = filterNewListings(
      [
        { platform: "demo" as const, externalId: "1" },
        { platform: "demo" as const, externalId: "2" },
        { platform: "demo" as const, externalId: "2" },
      ],
      existing,
    );
    expect(result).toEqual([{ platform: "demo", externalId: "2" }]);
  });
});
