import { PLATFORMS, type PlatformId, type SearchQuery } from "@tixing/shared";
import { PlatformNotAvailableError, type PlatformAdapter } from "./base.js";

/** Placeholder adapter for platforms without an allowed data source. */
export class StubPlatformAdapter implements PlatformAdapter {
  readonly id: PlatformId;
  readonly capability;

  constructor(id: PlatformId) {
    this.id = id;
    this.capability = PLATFORMS[id].capability;
  }

  async search(_query: SearchQuery): Promise<never> {
    const meta = PLATFORMS[this.id];
    throw new PlatformNotAvailableError(
      this.id,
      meta.capability,
      `${meta.nameJa}（${meta.nameZh}）当前为「${meta.capability === "needs_auth" ? "需要授权" : "暂不支持"}」，MVP 不执行真实采集。${meta.notesZh}`,
    );
  }
}
