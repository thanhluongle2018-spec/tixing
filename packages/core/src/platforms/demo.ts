import type { NormalizedListing, SearchQuery } from "@tixing/shared";
import type { PlatformAdapter } from "./base.js";

/**
 * Demo adapter: generates deterministic faux listings for pipeline verification.
 * Not a real marketplace.
 */
export class DemoPlatformAdapter implements PlatformAdapter {
  readonly id = "demo" as const;
  readonly capability = "supported" as const;

  async search(query: SearchQuery): Promise<NormalizedListing[]> {
    const keyword = query.keywords[0] ?? "demo";
    const now = Date.now();
    // Bucket by minute so re-runs within the same minute dedupe; new minute => new item.
    const bucket = Math.floor(now / 60_000);
    const priceBase = 1000 + (bucket % 50) * 100;
    const price =
      query.priceMin != null && query.priceMax != null
        ? Math.min(Math.max(priceBase, query.priceMin), query.priceMax)
        : priceBase;

    const items: NormalizedListing[] = [
      {
        platform: "demo",
        externalId: `demo-${keyword}-${bucket}`,
        url: `https://example.invalid/demo/${encodeURIComponent(keyword)}/${bucket}`,
        title: `[Demo] ${keyword} 上新 #${bucket}`,
        price,
        currency: "JPY",
        imageUrl: "https://placehold.co/400x400/png?text=Demo",
        seller: query.seller?.trim() || "demo-seller",
        publishedAt: new Date(now),
        raw: { keyword, bucket, brand: query.brand, model: query.model, category: query.category },
      },
    ];

    // Occasionally emit a second variant without image/seller to test partial fields.
    if (bucket % 3 === 0) {
      items.push({
        platform: "demo",
        externalId: `demo-${keyword}-${bucket}-b`,
        url: `https://example.invalid/demo/${encodeURIComponent(keyword)}/${bucket}-b`,
        title: `[Demo] ${keyword} 副条目`,
        price: price + 50,
        currency: "JPY",
        imageUrl: null,
        seller: null,
        publishedAt: null,
        raw: { partial: true },
      });
    }

    return items.filter((item) => {
      if (query.priceMin != null && item.price != null && item.price < query.priceMin) return false;
      if (query.priceMax != null && item.price != null && item.price > query.priceMax) return false;
      if (query.brand && item.title && !item.title.includes(query.brand) && !keywordIncludes(query, "brand")) {
        // brand is optional soft filter on raw for demo
      }
      return true;
    });
  }
}

function keywordIncludes(query: SearchQuery, _field: string): boolean {
  return Boolean(query.brand || query.model || query.category);
}
