import { describe, expect, it } from "vitest";
import { DemoPlatformAdapter } from "./demo.js";
import { StubPlatformAdapter } from "./stub.js";
import { PlatformNotAvailableError } from "./base.js";
import { PLATFORMS } from "@tixing/shared";
import { getPlatformAdapter, listPlatformStatuses } from "./registry.js";

describe("platform adapters", () => {
  it("demo adapter returns listings with required identity fields", async () => {
    const adapter = new DemoPlatformAdapter();
    const items = await adapter.search({ keywords: ["ニンテンドー"] });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.platform).toBe("demo");
      expect(item.externalId).toBeTruthy();
      expect(item.url).toContain("example.invalid");
    }
  });

  it("stub adapters refuse collection", async () => {
    const stub = new StubPlatformAdapter("mercari");
    await expect(stub.search({ keywords: ["test"] })).rejects.toBeInstanceOf(
      PlatformNotAvailableError,
    );
  });

  it("registry marks only demo as supported and keeps Ichiba/Suruga out of MVP select", () => {
    const statuses = listPlatformStatuses();
    const supported = statuses.filter((s) => s.capability === "supported");
    expect(supported.map((s) => s.id)).toEqual(["demo"]);
    expect(getPlatformAdapter("rakuma").capability).toBe("unsupported");
    expect(getPlatformAdapter("yahoo_auctions").capability).toBe("needs_auth");
    expect(PLATFORMS.rakuten_ichiba.selectableInMvp).toBe(false);
    expect(PLATFORMS.surugaya.selectableInMvp).toBe(false);
  });
});
