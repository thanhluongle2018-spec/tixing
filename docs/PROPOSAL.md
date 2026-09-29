# 多平台商品上新监控与提醒工具 — 技术方案

> 状态：**已确认**（按 2026-09-29 用户决定更新）  
> 说明：技术选型与 MVP 边界以下文为准；骏河屋不纳入 MVP。

---

## 0. 已确认决定

| # | 决定 |
| --- | --- |
| 1 | **TypeScript 全栈**，不采用 FastAPI / Python |
| 2 | MVP = **监控内核 + Demo Adapter + 平台占位**；不做真实抓取 |
| 3 | 「乐天二手」= **ラクマ**；**Yahoo!フリマ** 与 **ヤフオク!** 分别列出；**楽天市場（Ichiba）** 为独立可选平台，单独评估，不与ラクマ混同 |
| 4 | **骏河屋不纳入 MVP**；后续可评估公开页面 + 严格限流试点，开始前须再确认访问规则与技术可行性 |
| 5 | **单用户自托管**，单机 **Docker Compose** |
| 6 | UI **中文优先**；平台名称保留 **日文原名** |

---

## 1. 当前仓库结构与技术栈

### 1.1 仓库现状

| 项目 | 状态 |
| --- | --- |
| 跟踪文件 | 方案文档起步；业务代码按本方案实现 |
| 既有框架 | 无（空仓库 greenfield） |

### 1.2 确认技术栈（TypeScript 全栈）

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 语言 / 运行时 | **TypeScript 5.x + Node.js 22 LTS** | 全仓库统一 |
| 包管理 / 仓库 | **pnpm workspaces** monorepo | `apps/*` + `packages/*` |
| HTTP API | **Hono**（`@hono/node-server`） | 轻量、原生 TS、适合自托管单用户 |
| 校验 | **Zod** | 请求体 / 环境变量 / 共享 DTO |
| ORM / 迁移 | **Prisma** + PostgreSQL | schema 即迁移来源 |
| 数据库 | **PostgreSQL 16** | Compose 服务 |
| 队列 / 调度 | **BullMQ + Redis 7** | 检查任务、通知重试、限流与失败恢复 |
| 共享内核 | `packages/core` | 平台 adapter、通知 adapter、去重与发现服务 |
| 共享类型 | `packages/shared` | 平台 ID、能力枚举、DTO |
| 数据访问 | `packages/db` | Prisma client 与 schema |
| 前端 | **React 19 + Vite + TypeScript** | 中文管理后台 |
| 样式 | 自有 CSS 变量（非组件库堆叠） | 简洁后台，非营销落地页 |
| 配置 | **dotenv + Zod**；`.env.example` | 密钥不进源码 |
| 部署 | **Docker Compose**（api / worker / web / postgres / redis） | 单机自托管 |
| 测试 | **Vitest** | 调度、去重、platform / notify adapter |

不采用：FastAPI、NestJS（过重）、Next.js 全栈一体（调度 Worker 拆分更清晰）。

---

## 2. 整体架构与模块边界

```
┌──────────────┐     HTTP      ┌─────────────────┐
│  Web (Vite)  │ ───────────▶  │  API (Hono)     │
└──────────────┘               └────────┬────────┘
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                  ▼
              ┌────────────┐    ┌─────────────┐    ┌──────────────┐
              │ PostgreSQL │    │ Redis/BullMQ│    │ .env secrets │
              └────────────┘    └──────┬──────┘    └──────────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │ Worker (Node)  │
                              └────────┬───────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
        ┌────────────────┐   ┌─────────────────┐   ┌────────────────┐
        │ PlatformAdapter│   │ Dedup/Persist   │   │ NotifyAdapter  │
        │ (demo + stubs) │   │ Items/Alerts    │   │ Telegram/Bark  │
        └────────────────┘   └─────────────────┘   └────────────────┘
```

### 2.1 模块职责

| 模块 | 职责 | 不得包含 |
| --- | --- | --- |
| `apps/api` | 任务 CRUD、启停、商品筛选、统计、通知配置、测试通知 | 平台抓取细节、队列消费逻辑 |
| `apps/worker` | 定时扫描到期任务、入队执行、并发/超时/退避/限流、通知重试 | HTTP 路由、前端 |
| `packages/core/platforms` | 每平台独立 adapter + 能力声明 | 调度策略、DB、通知协议 |
| `packages/core/notifications` | Telegram / Bark 等渠道 | 采集、调度 |
| `packages/core/services` | 发现、去重、投递编排 | 传输层细节 |
| `packages/db` | Prisma models / migrations | 业务编排 |
| `apps/web` | 中文 UI；平台名显示日文原名 | 绕过后端写业务规则 |

### 2.2 关键原则

1. Adapter 与调度解耦；调度只看 `PlatformCapability`。
2. 幂等：`(platform, externalId)`；通知 `(listingId, channelId)`。
3. 无允许数据源 → UI「暂不支持」或「需要授权」，**禁止显示为已支持**。
4. 密钥仅环境变量；日志脱敏。

---

## 3. 数据表设计

（字段语义同前一版，Prisma 实现。）

- `MonitorTask` — 任务、关键词、价格、可选筛选、间隔、状态、上次/下次检查、最近错误  
- `Listing` — 统一商品；`@@unique([platform, externalId])`  
- `TaskListing` — 任务↔商品  
- `NotificationChannel` — telegram / bark（MVP）；其余类型可预留枚举但不实现  
- `TaskChannel` — 任务↔渠道  
- `NotificationDelivery` — 投递状态与重试；`@@unique([listingId, channelId])`  
- `JobRun` — 每次检查审计  

间隔选项：60 / 300 / 600 / 1800 秒；**不开放 30 秒**。

---

## 4. 目录结构

```text
.
├── README.md
├── .env.example
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── docs/
│   ├── PROPOSAL.md
│   ├── PLATFORM_STATUS.md
│   └── LOCAL_SETUP.md
├── apps/
│   ├── api/                 # Hono
│   ├── worker/              # BullMQ worker + tick
│   └── web/                 # Vite React
└── packages/
    ├── shared/              # 平台 ID、能力、DTO、Zod
    ├── db/                  # Prisma schema + client
    └── core/                # platforms / notifications / services
        └── src/
            ├── platforms/
            │   ├── base.ts
            │   ├── registry.ts
            │   ├── demo.ts
            │   ├── mercari.ts          # unsupported 占位
            │   ├── rakuma.ts           # unsupported
            │   ├── yahooFleamarket.ts  # unsupported
            │   ├── yahooAuctions.ts    # needs_auth
            │   ├── rakutenIchiba.ts    # needs_auth（独立可选，非 MVP 实现）
            │   └── surugaya.ts         # unsupported；非 MVP
            └── notifications/
                ├── telegram.ts
                └── bark.ts
```

---

## 5. 平台矩阵（产品用语 ↔ 系统 ID）

| 产品用语 | 日文原名（UI 显示） | `platform` ID | MVP | 能力状态 |
| --- | --- | --- | --- | --- |
| （演示） | Demo | `demo` | ✅ 唯一可运行数据源 | `supported` |
| 煤炉 | メルカリ | `mercari` | 占位 | `unsupported` |
| 乐天二手 | ラクマ | `rakuma` | 占位 | `unsupported` |
| 雅虎闲置 | Yahoo!フリマ | `yahoo_fleamarket` | 占位 | `unsupported` |
| 雅虎日拍 | ヤフオク! | `yahoo_auctions` | 占位 | `needs_auth` |
| 乐天市场 | 楽天市場 | `rakuten_ichiba` | **不实现**；独立后续评估 | `needs_auth` |
| 骏河屋 | 駿河屋 | `surugaya` | **不纳入 MVP** | `unsupported`（后续试点前再确认） |
| 闪电市场 | — | — | 不做 | — |

说明：

- ラクマ ≠ 楽天市場；Ichiba 官方 Item Search 明确排除フリマ/C2C，若未来接入必须单独命名与评估。  
- ヤフオク! 官方 Web API 已于 2020 年终止 → `needs_auth`。  
- 骏河屋：MVP 不做；后续若试点公开页，须先确认 robots/条款与严格限流方案。

---

## 6. MVP 范围

**做：**

1. 任务创建/编辑/启停/删除；多关键词；价格与可选品牌/型号/分类/卖家  
2. 间隔 1/5/10/30 分钟；并发限制、超时、退避、全局限流  
3. Demo Adapter 产出可去重商品并触发提醒  
4. 目标平台占位 + 正确状态展示  
5. Telegram + Bark；测试通知；分渠道失败隔离与有限重试  
6. 商品列表筛选、详情外链、基础统计  
7. Compose 一键启动、迁移、文档、Vitest 核心测试  

**不做：**

- 任何真实平台抓取 / 绕过反爬  
- 骏河屋采集  
- 楽天市場实现（仅注册表占位）  
- 钉钉/飞书/企微/Email/Webhook（可留类型，不实现）  
- 微信系、自动收藏/下单、多用户账号体系  

---

## 7. 可行性清单（更新）

### 已验证可实现（MVP）

监控内核、Demo 数据源、去重、Telegram、Bark、占位状态 UI、Compose 单机部署。

### 需要授权或进一步调查

メルカリ / ラクマ / Yahoo!フリマ / ヤフオク! 真实源；楽天市場 Ichiba（独立）；骏河屋公开页试点规则。

### 暂不建议 / 本期不做

服务端抓取上述平台；非官方刮擦 API 冒充已支持；绕过验证码；自动下单；个人微信直推；闪电市场；默认 30 秒高频。

---

## 8. 通知（MVP）

| 渠道 | 状态 | 配置 |
| --- | --- | --- |
| Telegram | ✅ | `TELEGRAM_BOT_TOKEN` + chatId |
| Bark | ✅ | device key / 可选自建 base URL |

内容：平台日文名、标题、价格、图片（若有）、卖家（若有）、链接。渠道并行；失败重试最多 3 次。

---

## 9. 频率与限流

- 任务级：1/5/10/30 分钟  
- 平台级 semaphore + RPM（Demo 宽松；真实平台接入时收紧）  
- Worker 全局并发（默认 2）  
- HTTP 超时 20s；失败写入 `lastError`，连续失败可标 `error`  
- 30 秒开关默认关闭  

---

## 10. 安全与文档

- `.env.example` 无真实凭据  
- `docs/LOCAL_SETUP.md`、`docs/PLATFORM_STATUS.md`、根 `README.md`  
- Prisma migrate 随 Compose 启动  

---

## 11. 实现顺序

1. 更新本方案（本文件）并推送 PR  
2. 脚手架 monorepo + Prisma + Compose  
3. 内核：任务 / 发现去重 / Demo / 通知 / Worker  
4. Web 中文 UI  
5. 测试与文档  

---

## 12. 平台调研摘要（保留）

详见历史调研：メルカリ无公开 C2C 搜索 API 且指南限制非官方界面/BOT；ラクマ禁止未许可 BOT；Yahoo 拍卖 API 已关；Yahoo!フリマ无公开搜索 API；駿河屋无官方搜索 API 且 `robots.txt` Disallow `/search/`、Crawl-delay 30。第三方非官方 API 不视为「平台允许」。
