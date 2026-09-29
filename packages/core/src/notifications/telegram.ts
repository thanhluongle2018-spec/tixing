import type { NotifyAdapter, NotifyPayload, NotifyResult } from "./base.js";
import { formatNotifyText } from "./base.js";

async function telegramRequest(
  token: string,
  method: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<NotifyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export class TelegramNotifyAdapter implements NotifyAdapter {
  readonly type = "telegram" as const;

  constructor(private readonly timeoutMs = 20_000) {}

  async send(config: Record<string, string>, payload: NotifyPayload): Promise<NotifyResult> {
    const token = config.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const chatId = config.chatId || "";
    if (!token || !chatId) {
      return { ok: false, error: "缺少 Telegram botToken 或 chatId" };
    }
    const text = formatNotifyText(payload);
    if (payload.imageUrl) {
      const photo = await telegramRequest(
        token,
        "sendPhoto",
        { chat_id: chatId, photo: payload.imageUrl, caption: text },
        this.timeoutMs,
      );
      if (photo.ok) return photo;
      // fall back to text if image fails
    }
    return telegramRequest(token, "sendMessage", { chat_id: chatId, text }, this.timeoutMs);
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
