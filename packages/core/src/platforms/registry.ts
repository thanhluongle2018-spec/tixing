import type { PlatformId } from "@tixing/shared";
import { PLATFORMS } from "@tixing/shared";
import type { PlatformAdapter } from "./base.js";
import { DemoPlatformAdapter } from "./demo.js";
import { StubPlatformAdapter } from "./stub.js";

const adapters: Record<PlatformId, PlatformAdapter> = {
  demo: new DemoPlatformAdapter(),
  mercari: new StubPlatformAdapter("mercari"),
  rakuma: new StubPlatformAdapter("rakuma"),
  yahoo_fleamarket: new StubPlatformAdapter("yahoo_fleamarket"),
  yahoo_auctions: new StubPlatformAdapter("yahoo_auctions"),
  rakuten_ichiba: new StubPlatformAdapter("rakuten_ichiba"),
  surugaya: new StubPlatformAdapter("surugaya"),
};

export function getPlatformAdapter(id: PlatformId): PlatformAdapter {
  return adapters[id];
}

export function listPlatformStatuses() {
  return Object.values(PLATFORMS).map((p) => ({
    ...p,
    adapterCapability: adapters[p.id].capability,
  }));
}

export { adapters };
