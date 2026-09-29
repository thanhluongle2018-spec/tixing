import { describe, expect, it, vi, afterEach } from "vitest";
import { formatNotifyText } from "./base.js";
import { TelegramNotifyAdapter } from "./telegram.js";
import { BarkNotifyAdapter } from "./bark.js";

describe("notify adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats notification body", () => {
    const text = formatNotifyText({
      platformLabel: "メルカリ（煤炉）",
      title: "测试商品",
      price: 5000,
      currency: "JPY",
      imageUrl: null,
      seller: "seller-a",
      url: "https://example.com/item/1",
    });
    expect(text).toContain("メルカリ");
    expect(text).toContain("5000");
    expect(text).toContain("seller-a");
  });

  it("telegram adapter posts sendMessage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new TelegramNotifyAdapter(5000);
    const result = await adapter.send(
      { botToken: "TOKEN", chatId: "123" },
      {
        platformLabel: "Demo",
        title: "t",
        price: 1,
        currency: "JPY",
        imageUrl: null,
        seller: null,
        url: "https://example.invalid/x",
      },
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("api.telegram.org/botTOKEN/sendMessage");
  });

  it("bark adapter posts to device endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new BarkNotifyAdapter(5000);
    const result = await adapter.sendTest({ deviceKey: "KEY", baseUrl: "https://bark.example" });
    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://bark.example/KEY");
  });
});
