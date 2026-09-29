import { describe, expect, it } from "vitest";
import { ConcurrencyGate, RateLimiter } from "./rateLimit.js";

describe("RateLimiter", () => {
  it("limits bursts", () => {
    const limiter = new RateLimiter(2, 0);
    expect(limiter.tryTake("p")).toBe(true);
    expect(limiter.tryTake("p")).toBe(true);
    expect(limiter.tryTake("p")).toBe(false);
  });
});

describe("ConcurrencyGate", () => {
  it("caps parallel work", async () => {
    const gate = new ConcurrencyGate(1);
    let concurrent = 0;
    let max = 0;
    const job = async () => {
      concurrent += 1;
      max = Math.max(max, concurrent);
      await new Promise((r) => setTimeout(r, 30));
      concurrent -= 1;
    };
    await Promise.all([gate.run(job), gate.run(job), gate.run(job)]);
    expect(max).toBe(1);
  });
});
