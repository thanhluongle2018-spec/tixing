import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { loadEnv } from "./env.js";
import { createCheckQueue, createRedis } from "./queue.js";
import { taskRoutes } from "./routes/tasks.js";
import { channelRoutes } from "./routes/channels.js";
import { listingRoutes } from "./routes/listings.js";
import { statsRoutes } from "./routes/stats.js";

const env = loadEnv();
const redis = createRedis(env.REDIS_URL);
const checkQueue = createCheckQueue(redis);

const app = new Hono();

app.use(
  "*",
  cors({
    origin: env.WEB_ORIGIN,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/tasks", taskRoutes(checkQueue));
app.route("/api/channels", channelRoutes());
app.route("/api/listings", listingRoutes());
app.route("/api/stats", statsRoutes());

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: "参数无效", details: err.flatten() }, 400);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "服务器错误" }, 500);
});

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
