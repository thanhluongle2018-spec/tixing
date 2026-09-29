# 提行 · 多平台商品上新监控

单用户自托管的二手平台上新监控与提醒工具（TypeScript 全栈）。

## MVP 范围

- 监控任务 CRUD / 启停 / 立即检查
- **Demo Adapter** 验证发现 → 去重 → 通知全链路
- 平台占位：メルカリ、ラクマ、Yahoo!フリマ、ヤフオク!（状态为暂不支持 / 需要授权）
- 通知：Telegram、Bark
- 商品列表与基础统计
- Docker Compose 一键部署

**不做真实抓取。** 骏河屋与楽天市場不纳入 MVP 实现。

## 技术栈

| 层 | 选型 |
| --- | --- |
| API | Hono + Zod |
| Worker | BullMQ + Redis |
| DB | PostgreSQL + Prisma |
| Web | React + Vite |
| 部署 | Docker Compose |

详情见 [`docs/PROPOSAL.md`](docs/PROPOSAL.md)、[`docs/LOCAL_SETUP.md`](docs/LOCAL_SETUP.md)、[`docs/PLATFORM_STATUS.md`](docs/PLATFORM_STATUS.md)。

## 快速开始

```bash
cp .env.example .env
docker compose up --build
```

浏览器打开 http://localhost:8080
