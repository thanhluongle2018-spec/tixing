const BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export type PlatformStatus = {
  id: string;
  nameZh: string;
  nameJa: string;
  capability: "supported" | "unsupported" | "needs_auth";
  capabilityLabel: string;
  selectableInMvp: boolean;
  notesZh: string;
};

export type Stats = {
  tasks: { total: number; active: number };
  listings: { total: number };
  notifications: { sent: number; failed: number; successRate: number | null };
  platforms: PlatformStatus[];
};

export type Channel = {
  id: string;
  name: string;
  type: "telegram" | "bark";
  enabled: boolean;
  config: Record<string, unknown>;
};

export type Task = {
  id: string;
  name: string;
  platforms: string[];
  keywords: string[];
  priceMin: string | number | null;
  priceMax: string | number | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  seller: string | null;
  intervalSeconds: number;
  status: "active" | "paused" | "error";
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastError: string | null;
  channels?: { channel: Channel }[];
  _count?: { listings: number };
};

export type Listing = {
  id: string;
  platform: string;
  externalId: string;
  url: string;
  title: string | null;
  price: string | number | null;
  currency: string;
  imageUrl: string | null;
  seller: string | null;
  publishedAt: string | null;
  discoveredAt: string;
};

export const api = {
  stats: () => request<Stats>("/api/stats"),
  platforms: () => request<{ items: PlatformStatus[] }>("/api/stats/platforms"),
  tasks: () => request<{ items: Task[] }>("/api/tasks"),
  createTask: (body: unknown) =>
    request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: unknown) =>
    request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  enableTask: (id: string) => request<Task>(`/api/tasks/${id}/enable`, { method: "POST" }),
  pauseTask: (id: string) => request<Task>(`/api/tasks/${id}/pause`, { method: "POST" }),
  runTask: (id: string) => request<{ ok: boolean }>(`/api/tasks/${id}/run`, { method: "POST" }),
  deleteTask: (id: string) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  channels: () => request<{ items: Channel[] }>("/api/channels"),
  createChannel: (body: unknown) =>
    request<Channel>("/api/channels", { method: "POST", body: JSON.stringify(body) }),
  deleteChannel: (id: string) =>
    request<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" }),
  testChannel: (id: string) =>
    request<{ ok: boolean; error?: string }>(`/api/channels/${id}/test`, { method: "POST" }),
  listings: (qs: string) =>
    request<{ total: number; items: Listing[] }>(`/api/listings?${qs}`),
};
