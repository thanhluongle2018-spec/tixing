# 本地启动说明

## 依赖

- Node.js 22+
- pnpm 10+
- Docker / Docker Compose（推荐一键启动）

## 方式 A：Docker Compose（推荐）

```bash
cp .env.example .env
docker compose up --build
```

Compose 将 Postgres / Redis 端口发布到本机，应用容器通过 `host.docker.internal` 连接（并配置 `extra_hosts: host-gateway`）。这样在部分桥接网络受限的环境也能启动。

服务：

| 服务 | 地址 |
| --- | --- |
| Web | http://localhost:8080 |
| API | http://localhost:3000 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

可选环境变量（写入项目根目录 `.env`；`api` / `worker` 会通过 `env_file` 读取）：

- `TELEGRAM_BOT_TOKEN`
- `BARK_BASE_URL`（默认 `https://api.day.app`）

渠道的 chatId / deviceKey 也可在 Web「通知渠道」中配置。Compose 内置的 Postgres 账号密码仅为本地开发默认值（`tixing` / `tixing`），请勿用于公网。

## 方式 B：本地进程开发

1. 启动依赖：

```bash
docker compose up -d postgres redis
```

2. 安装与迁移：

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate:dev
pnpm --filter @tixing/shared build
pnpm --filter @tixing/db build
pnpm --filter @tixing/core build
```

3. 三个终端：

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Web：http://localhost:5173（Vite 代理 `/api` → API）

## 建议验证路径

1. 打开「通知渠道」，添加 Telegram 或 Bark（可先跳过）
2. 「监控任务」新建任务，平台勾选 **Demo**，填写关键词
3. 点击「启用」或「立即检查」
4. 在「商品列表」查看 Demo 商品；同一分钟内重复检查应去重
5. 「平台状态」确认メルカリ/ラクマ等为暂不支持或需要授权

## 测试

```bash
pnpm --filter @tixing/shared build
pnpm --filter @tixing/core test
```
