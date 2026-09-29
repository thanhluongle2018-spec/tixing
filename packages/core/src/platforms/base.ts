import type {
  NormalizedListing,
  PlatformCapability,
  PlatformId,
  SearchQuery,
} from "@tixing/shared";

export class PlatformNotAvailableError extends Error {
  readonly platformId: PlatformId;
  readonly capability: PlatformCapability;

  constructor(platformId: PlatformId, capability: PlatformCapability, message: string) {
    super(message);
    this.name = "PlatformNotAvailableError";
    this.platformId = platformId;
    this.capability = capability;
  }
}

export interface PlatformAdapter {
  readonly id: PlatformId;
  readonly capability: PlatformCapability;
  search(query: SearchQuery): Promise<NormalizedListing[]>;
}
