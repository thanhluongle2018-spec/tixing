import type { NormalizedListing } from "@tixing/shared";

/** Pure helper: key used for platform-level deduplication. */
export function listingDedupeKey(listing: Pick<NormalizedListing, "platform" | "externalId">): string {
  return `${listing.platform}::${listing.externalId}`;
}

export function filterNewListings<T extends Pick<NormalizedListing, "platform" | "externalId">>(
  candidates: T[],
  existingKeys: Set<string>,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of candidates) {
    const key = listingDedupeKey(item);
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
