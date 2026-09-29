const PLATFORM_JA: Record<string, string> = {
  demo: "Demo",
  mercari: "メルカリ",
  rakuma: "ラクマ",
  yahoo_fleamarket: "Yahoo!フリマ",
  yahoo_auctions: "ヤフオク!",
  rakuten_ichiba: "楽天市場",
  surugaya: "駿河屋",
};

export function platformName(id: string) {
  return PLATFORM_JA[id] ?? id;
}

export function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN");
}

export function formatPrice(price: string | number | null | undefined, currency = "JPY") {
  if (price == null || price === "") return "—";
  return `${price} ${currency}`;
}

export function intervalLabel(seconds: number) {
  if (seconds === 60) return "1 分钟";
  if (seconds === 300) return "5 分钟";
  if (seconds === 600) return "10 分钟";
  if (seconds === 1800) return "30 分钟";
  return `${seconds} 秒`;
}
