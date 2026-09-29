import { z } from "zod";
import { PLATFORM_IDS } from "./platforms.js";

export const INTERVAL_OPTIONS = [60, 300, 600, 1800] as const;

export const TaskStatusSchema = z.enum(["active", "paused", "error"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ChannelTypeSchema = z.enum([
  "telegram",
  "bark",
  "dingtalk",
  "feishu",
  "wecom",
  "email",
  "webhook",
]);
export type ChannelType = z.infer<typeof ChannelTypeSchema>;

export const PlatformIdSchema = z.enum(PLATFORM_IDS);

const IntervalSchema = z
  .number()
  .int()
  .refine((n): n is (typeof INTERVAL_OPTIONS)[number] =>
    (INTERVAL_OPTIONS as readonly number[]).includes(n),
  );

export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(120),
  platforms: z.array(PlatformIdSchema).min(1),
  keywords: z.array(z.string().min(1).max(80)).min(1),
  priceMin: z.number().nonnegative().nullable().optional(),
  priceMax: z.number().nonnegative().nullable().optional(),
  brand: z.string().max(80).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  seller: z.string().max(80).nullable().optional(),
  intervalSeconds: IntervalSchema,
  channelIds: z.array(z.string().uuid()).default([]),
});

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  status: TaskStatusSchema.optional(),
});

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["telegram", "bark"]),
  config: z.record(z.string()),
  enabled: z.boolean().default(true),
});

export const UpdateChannelSchema = CreateChannelSchema.partial();

export const ListingQuerySchema = z.object({
  platform: PlatformIdSchema.optional(),
  keyword: z.string().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type NormalizedListing = {
  platform: z.infer<typeof PlatformIdSchema>;
  externalId: string;
  url: string;
  title: string | null;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  seller: string | null;
  publishedAt: Date | null;
  raw?: Record<string, unknown>;
};

export type SearchQuery = {
  keywords: string[];
  priceMin?: number | null;
  priceMax?: number | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  seller?: string | null;
};
