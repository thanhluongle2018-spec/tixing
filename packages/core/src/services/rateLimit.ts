/** Simple in-process token bucket per key (platform / global). */
export class RateLimiter {
  private readonly tokens = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly maxTokens: number,
    private readonly refillPerSecond: number,
  ) {}

  tryTake(key: string, cost = 1): boolean {
    const now = Date.now();
    const state = this.tokens.get(key) ?? { tokens: this.maxTokens, updatedAt: now };
    const elapsed = (now - state.updatedAt) / 1000;
    state.tokens = Math.min(this.maxTokens, state.tokens + elapsed * this.refillPerSecond);
    state.updatedAt = now;
    if (state.tokens < cost) {
      this.tokens.set(key, state);
      return false;
    }
    state.tokens -= cost;
    this.tokens.set(key, state);
    return true;
  }
}

export class ConcurrencyGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.waiters.shift();
      if (next) next();
    }
  }
}
