export const PLATFORM_IDS = [
  "demo",
  "mercari",
  "rakuma",
  "yahoo_fleamarket",
  "yahoo_auctions",
  "rakuten_ichiba",
  "surugaya",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

/** Capability shown in UI — never claim supported without a real allowed source. */
export type PlatformCapability = "supported" | "unsupported" | "needs_auth";

export type PlatformMeta = {
  id: PlatformId;
  /** Chinese label for product copy */
  nameZh: string;
  /** Japanese original name shown in UI */
  nameJa: string;
  capability: PlatformCapability;
  /** Whether users may select this platform on tasks in MVP */
  selectableInMvp: boolean;
  notesZh: string;
};

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  demo: {
    id: "demo",
    nameZh: "演示数据源",
    nameJa: "Demo",
    capability: "supported",
    selectableInMvp: true,
    notesZh: "本地演示用固定/生成数据，用于验证监控全链路，非真实交易平台。",
  },
  mercari: {
    id: "mercari",
    nameZh: "煤炉",
    nameJa: "メルカリ",
    capability: "unsupported",
    selectableInMvp: true,
    notesZh: "暂无可持续且允许的公开搜索数据源；MVP 不做真实抓取。",
  },
  rakuma: {
    id: "rakuma",
    nameZh: "乐天二手",
    nameJa: "ラクマ",
    capability: "unsupported",
    selectableInMvp: true,
    notesZh: "乐天二手按ラクマ处理；与楽天市場无关。暂不支持真实采集。",
  },
  yahoo_fleamarket: {
    id: "yahoo_fleamarket",
    nameZh: "雅虎闲置",
    nameJa: "Yahoo!フリマ",
    capability: "unsupported",
    selectableInMvp: true,
    notesZh: "与ヤフオク!分列；暂无公开搜索 API。",
  },
  yahoo_auctions: {
    id: "yahoo_auctions",
    nameZh: "雅虎日拍",
    nameJa: "ヤフオク!",
    capability: "needs_auth",
    selectableInMvp: true,
    notesZh: "官方拍卖 Web API 已终止；需平台授权或新官方接口后再评估。",
  },
  rakuten_ichiba: {
    id: "rakuten_ichiba",
    nameZh: "乐天市场",
    nameJa: "楽天市場",
    capability: "needs_auth",
    selectableInMvp: false,
    notesZh: "独立可选平台，不与ラクマ混同；MVP 不实现，需单独评估官方 API。",
  },
  surugaya: {
    id: "surugaya",
    nameZh: "骏河屋",
    nameJa: "駿河屋",
    capability: "unsupported",
    selectableInMvp: false,
    notesZh: "不纳入 MVP；后续若试点公开页须先确认访问规则与严格限流。",
  },
};

export function platformLabel(id: PlatformId): string {
  const p = PLATFORMS[id];
  return `${p.nameJa}（${p.nameZh}）`;
}

export function capabilityLabelZh(c: PlatformCapability): string {
  switch (c) {
    case "supported":
      return "已支持";
    case "unsupported":
      return "暂不支持";
    case "needs_auth":
      return "需要授权";
  }
}
