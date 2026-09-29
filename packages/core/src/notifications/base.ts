export type NotifyPayload = {
  platformLabel: string;
  title: string | null;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  seller: string | null;
  url: string;
};

export type NotifyResult = {
  ok: boolean;
  error?: string;
};

export interface NotifyAdapter {
  readonly type: "telegram" | "bark";
  send(config: Record<string, string>, payload: NotifyPayload): Promise<NotifyResult>;
  sendTest(config: Record<string, string>): Promise<NotifyResult>;
}

export function formatNotifyText(payload: NotifyPayload): string {
  const lines = [
    `平台：${payload.platformLabel}`,
    `标题：${payload.title ?? "（无标题）"}`,
    `价格：${payload.price != null ? `${payload.price} ${payload.currency}` : "（未知）"}`,
  ];
  if (payload.seller) lines.push(`卖家：${payload.seller}`);
  lines.push(`链接：${payload.url}`);
  return lines.join("\n");
}
