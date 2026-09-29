import type { NotifyAdapter, NotifyPayload, NotifyResult } from "./base.js";
import { formatNotifyText } from "./base.js";

export class BarkNotifyAdapter implements NotifyAdapter {
  readonly type = "bark" as const;

  constructor(private readonly timeoutMs = 20_000) {}

  async send(config: Record<string, string>, payload: NotifyPayload): Promise<NotifyResult> {
    const key = config.deviceKey || "";
    if (!key) return { ok: false, error: "缺少 Bark deviceKey" };
    const base = (config.baseUrl || process.env.BARK_BASE_URL || "https://api.day.app").replace(
      /\/$/,
      "",
    );
    const title = payload.title ?? "新品提醒";
    const body = formatNotifyText(payload);
    const url = `${base}/${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          url: payload.url,
          ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: text || `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendTest(config: Record<string, string>): Promise<NotifyResult> {
    return this.send(config, {
      platformLabel: "Demo（演示数据源）",
      title: "提行测试通知",
      price: 1234,
      currency: "JPY",
      imageUrl: null,
      seller: "test",
      url: "https://example.invalid/test",
    });
  }
}
