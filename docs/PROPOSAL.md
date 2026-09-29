# 多平台商品上新监控与提醒工具 — 技术方案

> 状态：待确认（第一步方案）  
> 日期：2026-09-29  
> 说明：本文仅作方案，**未实现业务代码**。确认后再进入 MVP 开发。

---

## 1. 当前仓库结构与技术栈

### 1.1 仓库现状

| 项目 | 状态 |
| --- | --- |
| 跟踪文件 | 无（已清空，仅保留 `.git`） |
| 既有框架 / 依赖 | 无 |
| 迁移 / 配置 | 无 |
| 历史 | `Initial commit`（LICENSE）→ `Clear repository contents` |

结论：这是**空仓库上的全新项目**，不存在可复用的应用代码或既定技术栈。后续实现属于 greenfield，不会覆盖现有业务代码。

### 1.2 建议技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 后端 | **Python 3.12 + FastAPI** | 适配器/异步 HTTP/测试生态成熟；适合调度与通知编排 |
| ORM / 迁移 | **SQLAlchemy 2.x + Alembic** | 明确模型与可版本化迁移 |
| 数据库 | **PostgreSQL 16** | 任务、商品、通知状态需要可靠约束与索引 |
| 缓存 / 队列 | **Redis 7 + ARQ**（或 Celery） | 定时检查、重试、全局限流；进程崩溃可恢复 |
| 前端 | **React 19 + Vite + TypeScript** | 管理后台（任务 / 商品 / 通知 / 统计）轻量可控 |
| 配置 | **pydantic-settings + `.env`** | 密钥不进源码；提供 `.env.example` |
| 容器 | **Docker Compose** | 本地一键起 API / Worker / Postgres / Redis / Web |
| 测试 | **pytest + httpx + pytest-asyncio** | 覆盖调度、去重、adapter、通知 |

备选（若你更偏好全 TS）：NestJS + Prisma + BullMQ + Next.js。默认按上表推进；确认时可切换。

---

## 2. 整体架构与模块边界

```
┌──────────────┐     HTTP      ┌─────────────────┐
│  Web (React) │ ───────────▶  │  API (FastAPI)  │
└──────────────┘               └────────┬────────┘
                                        │
                     ┌──────────────────┼──────────────────┐
                     ▼                  ▼                  ▼
              ┌────────────┐    ┌─────────────┐    ┌──────────────┐
              │ PostgreSQL │    │ Redis/Queue │    │ Config/Secrets│
              └────────────┘    └──────┬──────┘    └──────────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │ Scheduler/Worker│
                              └────────┬───────┘
                                       │
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
        ┌────────────────┐   ┌─────────────────┐   ┌────────────────┐
        │ PlatformAdapter│   │ Dedup/Persist   │   │ NotifyAdapter  │
        │ (per platform) │   │ Items/Alerts    │   │ (Telegram/Bark)│
        └────────────────┘   └─────────────────┘   └────────────────┘
```

### 2.1 模块职责

| 模块 | 职责 | 不得包含 |
| --- | --- | --- |
| `api` | 任务 CRUD、启停、商品筛选、统计、通知配置、测试通知 | 平台抓取细节、调度实现 |
| `scheduler` | 按任务间隔入队；并发上限、超时、退避、全局限流；失败恢复 | 具体平台解析、通知渠道协议 |
| `platforms/*` | 每个平台独立 adapter：搜索 → 标准化 `Listing` | 调度策略、DB 写入、通知发送 |
| `items` | 商品持久化、按平台 ID/URL 去重、筛选查询 | HTTP 采集、通知 |
| `notifications/*` | 渠道 adapter；分渠道发送、有限重试、状态记录 | 任务调度、平台采集 |
| `web` | 管理 UI：任务、商品、渠道、仪表盘 | 业务规则写在前端绕过后端 |

### 2.2 关键设计原则

1. **平台 adapter 与调度器解耦**：统一接口 `search(query) -> list[Listing]`，调度只依赖接口与能力声明（`supported` / `needs_auth` / `unsupported`）。
2. **幂等**：`(platform, external_id)` 唯一；通知按 `(item_id, channel_id)` 去重，重复跑任务不重复推送。
3. **合规优先**：不绕过验证码、登录墙、反爬；无可持续且允许的数据源时，UI 显示「暂不支持 / 需要授权」，**不得显示为已支持**。
4. **密钥隔离**：Token / Webhook URL / SMTP 等仅环境变量或加密配置表；日志脱敏。

---

## 3. 数据表设计（初稿）

### 3.1 `monitor_tasks`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID PK | |
| name | text | 任务名 |
| platforms | text[] / JSON | 勾选平台列表 |
| keywords | text[] / JSON | 中/日/英关键词 |
| price_min / price_max | numeric null | 价格区间（JPY） |
| brand / model / category / seller | text null | 可选筛选 |
| interval_seconds | int | 60 / 300 / 600 / 1800（30s 默认不开放） |
| status | enum | `active` / `paused` / `error` |
| last_checked_at / next_check_at | timestamptz null | |
| last_error | text null | 最近错误摘要 |
| created_at / updated_at | timestamptz | |

索引：`(status, next_check_at)`。

### 3.2 `listings`（统一商品）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID PK | |
| platform | text | `mercari` 等 |
| external_id | text | 平台商品 ID |
| url | text | 原链接 |
| title | text null | 允许缺失 |
| price | numeric null | |
| currency | text | 默认 `JPY` |
| image_url | text null | |
| seller | text null | |
| published_at | timestamptz null | |
| discovered_at | timestamptz | 首次发现 |
| raw | jsonb null | 原始字段快照（不含密钥） |
| UNIQUE | (platform, external_id) | 去重核心 |
| UNIQUE | (platform, url) | 无 ID 时的兜底（实现时按平台能力二选一或并存） |

### 3.3 `task_listings`

任务与商品多对多：`task_id`、`listing_id`、`matched_keyword`、`created_at`；`UNIQUE(task_id, listing_id)`。

### 3.4 `notification_channels`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID PK | |
| type | enum | `telegram` / `bark` / `dingtalk` / `feishu` / `wecom` / `email` / `webhook` |
| name | text | |
| config_enc | text / jsonb | 加密或仅存非敏感元数据；密钥优先引用 env / secret store |
| enabled | bool | |
| created_at / updated_at | | |

MVP 仅实现 `telegram`、`bark`；其余类型可建枚举但 UI 标「后续」。

### 3.5 `task_channels`

任务 ↔ 渠道：`task_id`、`channel_id`、`UNIQUE`。

### 3.6 `notification_deliveries`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID PK | |
| listing_id / channel_id / task_id | FK | |
| status | enum | `pending` / `sent` / `failed` / `skipped` |
| attempts | int | |
| last_error | text null | |
| sent_at | timestamptz null | |
| UNIQUE | (listing_id, channel_id) | 防重复通知 |

### 3.7 `platform_run_stats`（可选聚合）

按平台记录最近成功/失败、限流命中、平均延迟，供仪表盘展示。

### 3.8 `job_runs`（调度审计）

`task_id`、`started_at`、`finished_at`、`result`、`error`、`items_found`、`items_new`，支持失败排查与恢复。

---

## 4. 建议目录结构

```text
.
├── README.md
├── .env.example
├── docker-compose.yml
├── docs/
│   ├── PROPOSAL.md              # 本文
│   ├── PLATFORM_STATUS.md       # 平台支持矩阵（实现后维护）
│   └── LOCAL_SETUP.md           # 本地启动与配置
├── backend/
│   ├── pyproject.toml
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/                 # routes: tasks, listings, channels, stats
│   │   ├── core/                # config, security, logging
│   │   ├── db/                  # models, session, repositories
│   │   ├── domain/              # Listing, TaskQuery 等纯领域类型
│   │   ├── scheduler/           # enqueue, rate limit, recovery
│   │   ├── platforms/
│   │   │   ├── base.py          # Protocol + capability flags
│   │   │   ├── registry.py
│   │   │   ├── demo/            # 本地演示用固定数据源（非生产平台）
│   │   │   ├── mercari/
│   │   │   ├── rakuma/
│   │   │   ├── yahoo_fleamarket/
│   │   │   ├── yahoo_auctions/
│   │   │   └── surugaya/
│   │   ├── notifications/
│   │   │   ├── base.py
│   │   │   ├── telegram.py
│   │   │   ├── bark.py
│   │   │   └── ...
│   │   └── services/            # task service, discover service, notify service
│   └── tests/
│       ├── test_scheduler.py
│       ├── test_dedup.py
│       ├── test_platform_adapters.py
│       └── test_notify_adapters.py
└── frontend/
    ├── package.json
    └── src/
        ├── pages/               # Tasks, Listings, Channels, Dashboard
        ├── api/
        └── components/
```

---

## 5. 各平台数据来源、可行性与限制

平台中文名对照：

| 产品用语 | 对应服务 |
| --- | --- |
| 煤炉 | メルカリ / Mercari JP |
| 乐天二手商品 | 乐天ラクマ（fril.jp），**不是**乐天市场店铺商品 |
| 雅虎闲置 | Yahoo!フリマ |
| 雅虎日拍 | ヤフオク! |
| 骏河屋 | suruga-ya.jp |
| 闪电市场 | 本期明确不接入 |

### 5.1 煤炉（Mercari）

| 项 | 结论 |
| --- | --- |
| 官方公开搜索 API | **无**。一般开发者不可用 C2C 搜索 API |
| 相关官方 API | **Mercari Shops GraphQL**：面向店铺运营（订单/商品管理），需合同、客户端名、固定 JP IP；**不能替代全站二手搜索监控** |
| 登录 / 反爬 | Web/App 有较强反自动化；`robots.txt` 禁止 `/v1/`、`/v2/` 等路径 |
| 条款 | 指南「其他不适当行为」禁止：使用官方界面以外的方式访问（含 BOT/工具）、未经书面许可在服务外商用利用内容/系统、不正アクセス、逆向等（[帮助文章](https://help.jp.mercari.com/guide/articles/900/)） |
| 数据完整度 / 成本 | 非官方抓取维护成本高、易失效、合规风险高 |
| **方案判定** | **暂不建议实现抓取**；adapter 占位为 `unsupported` / `needs_partnership` |

### 5.2 乐天二手（ラクマ）

| 项 | 结论 |
| --- | --- |
| 官方公开搜索 API | **无** |
| 易混淆 API | **楽天市場 Item Search API** 明确 **排除** 拍卖 / フリマ / C2C（[文档](https://webservice.rakuten.co.jp/documentation)），**不能当作ラクマ数据源** |
| 店铺向 API | ラクマ公式ショップ等 B 端库存/订单联动，需商家资质与审核，非买家监控 |
| 条款 | 明确禁止用未许可 BOT/工具、非官方界面访问（2024-04 规约修订公示） |
| **方案判定** | **暂不建议实现**；占位 `unsupported` |

### 5.3 雅虎闲置（Yahoo!フリマ）

| 项 | 结论 |
| --- | --- |
| 官方公开搜索 API | **未发现** |
| Yahoo 开发者网络 | 现有能力偏购物出店等，**不含フリマ公开搜索** |
| 条款 | 与 LINE ヤフー共通规约 / フリマ・オークション指南相关；自动出品工具等受禁；对服务施加过度负载的行为被明确限制 |
| **方案判定** | **暂不建议实现**；占位 `unsupported` |

### 5.4 雅虎日拍（ヤフオク!）

| 项 | 结论 |
| --- | --- |
| 官方 Web API | **已于 2020-01 终止**（[Yahoo 开发者公告](https://developer.yahoo.co.jp/changelog/2019-10-10-auction161.html)） |
| RSS / 可持续官方源 | 原官方拍卖 API/RSS 路径不可用；第三方非官方包装 API **不视为「平台允许」** |
| 条款 | 禁止对服务器/网络造成过度负载的大量访问；自动出品工具等受禁 |
| **方案判定** | **暂不建议未授权抓取**；占位 `needs_auth`（若未来 LINE ヤフー重新开放或提供合作接口再评估） |

### 5.5 骏河屋（Suruga-ya）

| 项 | 结论 |
| --- | --- |
| 官方 API / RSS | **未发现**面向第三方的商品搜索 API |
| robots.txt | `Crawl-delay: 30`；**`Disallow: /search/`**；存在大量商品 sitemap（偏收录，不适合关键词实时监控） |
| 登录 | 浏览搜索通常无需登录；有 WAF/地区限制的第三方观测报告（非正式） |
| 条款 | 通贩规约禁止不正アクセス、妨害服务等；未明示「允许自动化监控」 |
| **方案判定** | **暂不建议高频搜索抓取**；占位 `unsupported`。若未来官方合作或明确允许的数据源出现，再单独验证 |

### 5.6 第三方「非官方 API」与浏览器自动化

Parse / ReefAPI / Apify 等包装层、以及绕过 WAF/验证码的方案：

- **不纳入默认实现**
- 不满足「优先官方 / 明确允许」原则
- 若你方自行取得平台书面授权或采购合规数据源，再通过配置启用对应 adapter

### 5.7 可选旁路（需你确认是否纳入产品范围）

| 选项 | 说明 | 建议 |
| --- | --- | --- |
| **Demo Adapter** | 本地固定/生成假商品，跑通任务→去重→通知→列表 | **MVP 强烈建议**，用于验证管线 |
| **楽天市場 Item Search** | 官方 API、需 App ID；覆盖市场店铺商品（可含中古店铺品），**不是ラクマ** | 可选 Phase 2+，UI 必须单独命名为「乐天市场」，禁止标成「乐天二手」 |
| **用户侧浏览器扩展** | 用户本机已登录会话内辅助，而非服务端爬站 | 合规边界需单独法律/产品评估，**不进 MVP** |
| **平台商务授权** | Mercari Shops / ラクマ公式店 / Yahoo 合作 | 拿到凭证后再把对应 adapter 从占位改为 `supported` |

---

## 6. MVP 范围与分阶段计划

### 6.1 MVP（第二步，确认方案后）

**纳入：**

1. 监控任务：创建 / 编辑 / 启用 / 暂停 / 删除  
2. 关键词（多语言字符串原样匹配，不做机翻）+ 价格区间 + 可选品牌/型号/分类/卖家字段  
3. 间隔选项：1 / 5 / 10 / 30 分钟（**不开放 30 秒**）  
4. 调度：并发限制、超时、指数退避、全局限流、失败恢复、幂等去重  
5. **仅接入「已确认允许」的数据源**：当前调研结论下为 **Demo Adapter**（端到端验证）；目标平台均以占位暴露能力状态  
6. 商品保存（字段可空）、统一列表筛选、详情跳转外链  
7. 通知：**Telegram Bot**、**Bark**；测试通知；分渠道失败隔离与有限重试  
8. 仪表盘：任务数、发现商品数、通知成功率、各平台状态（含「暂不支持」）  
9. `.env.example`、迁移、本地启动文档、`PLATFORM_STATUS`、核心测试  

**明确不纳入 MVP：**

- 煤炉 / ラクマ / Yahoo!フリマ / ヤフオク / 骏河屋 的真实采集实现  
- 钉钉 / 飞书 / 企微 / Email / 通用 Webhook（表结构可预留）  
- 公众号 / 个人微信 / 微信机器人  
- 闪电市场  
- 自动收藏、自动下单  
- 绕过验证码、登录保护、反爬  

### 6.2 Phase 2（第三步起，逐个验证）

每个平台单独开评估文档 → 有允许的数据源才编码 → 测试通过后把状态改为 `supported`。

优先顺序建议（在出现合规源的前提下）：

1. 乐天市场官方 API（若确认纳入，且命名区分）  
2. 骏河屋（仅当有官方/授权源；遵守 crawl-delay）  
3. ヤフオク / フリマ / メルカリ / ラクマ（高度依赖商务授权）  
4. 其余通知渠道  

### 6.3 Phase 3+

多用户账号体系、加密密钥托管、更细限流、平台健康探针、移动端优化等。

---

## 7. 功能可行性清单

### 7.1 已验证可实现（MVP）

| 功能 | 依据 |
| --- | --- |
| 任务 CRUD / 启停 / 状态与错误展示 | 纯自有系统 |
| 调度、限流、退避、失败恢复 | Redis + Worker |
| 商品去重与列表筛选 / 统计 | PostgreSQL 约束与聚合 |
| Telegram 通知 | [Bot API](https://core.telegram.org/bots/api) 公开稳定 |
| Bark 通知 | 公开 HTTP 推送接口，用户自备设备 Key |
| Demo 数据源跑通全链路 | 自有假数据，不触碰平台 ToS |
| 平台能力注册表 + UI「暂不支持」 | 架构层 |

### 7.2 需要平台授权或进一步调查

| 功能 | 说明 |
| --- | --- |
| Mercari C2C 搜索监控 | 需官方/合作数据源；Shops API 不满足 |
| ラクマ 搜索监控 | 需官方许可；市场 API 不可替代 |
| Yahoo!フリマ / ヤフオク 搜索监控 | 公开拍卖 API 已关；需新授权或官方替代 |
| 骏河屋关键词监控 | 无公开 API；robots 禁止 `/search/`；需官方态度或授权 |
| 钉钉 / 飞书 / 企微 / Email / Webhook | 技术可行，属产品扩展；Webhook/SMTP 配置与可达性需实测 |
| 楽天市場商品监控（非ラクマ） | 官方 API + App ID 审核；产品命名必须区分 |

### 7.3 暂不建议实现

| 功能 | 原因 |
| --- | --- |
| 服务端抓取煤炉 / ラクマ / 雅虎闲置 / 日拍 / 骏河屋搜索页 | 缺允许的数据源；条款/robots/反爬风险；违背「不绕过保护」要求 |
| 使用非官方第三方刮擦 API 冒充「已支持」 | 不稳定且不满足「明确允许」 |
| 绕过验证码 / 登录墙 / WAF | 明确禁止 |
| 自动收藏 / 自动下单 | 账号安全与误操作风险；需独立评估 |
| 公众号 / 个人微信稳定推送 | 无假设可用的个人微信推送；需单独确认官方可持续方式 |
| 闪电市场 | 本期范围外 |
| 默认全平台 30 秒高频 | 无平台允许依据，且负载不可控 |

---

## 8. 通知渠道说明（MVP）

| 渠道 | MVP | 配置（示例，真实值进环境变量） | 内容 |
| --- | --- | --- | --- |
| Telegram | ✅ | `TELEGRAM_BOT_TOKEN` + chat_id | 平台、标题、价格、图片（若有）、卖家（若有）、链接 |
| Bark | ✅ | 设备 Key / 自建服务器 URL | 同上 |
| 钉钉 / 飞书 / 企微 / Email / Webhook | Phase 2 | 各渠道 secret | 同结构 payload |
| 公众号 / 个人微信 | 后续调研 | — | 不假设可直推 |

发送策略：渠道并行、互不影响；失败重试（如最多 3 次、指数退避）；`notification_deliveries` 记状态与错误。

---

## 9. 频率与限流策略（草案）

| 层级 | 策略 |
| --- | --- |
| 任务级 | 用户选自 1/5/10/30 分钟；`next_check_at` 驱动 |
| 平台级 | 每平台独立 semaphore + RPM；Demo 可较松；真实平台按对方规则收紧 |
| 全局 | Worker 并发上限（如 2–5）；HTTP 超时（如 15–30s） |
| 失败 | 平台错误计入 `last_error`；连续失败可自动暂停并告警 |
| 30 秒 | 配置开关默认关闭；仅当平台明确允许且负载评估通过后开启 |

---

## 10. 安全与运维

- `.env.example` 只含占位符，无真实 Token  
- 日志禁止打印完整 Webhook / Bot Token / Cookie  
- DB 迁移由 Alembic 管理；Compose 首次启动执行 migrate  
- README + `docs/LOCAL_SETUP.md` + `docs/PLATFORM_STATUS.md`  
- CI（后续）：lint + pytest  

---

## 11. 需要你确认的问题

请确认或调整以下几点后，再进入第二步实现：

1. **技术栈**：默认 Python FastAPI + React/Vite + Postgres + Redis，是否同意？  
2. **MVP 平台**：当前调研下真实目标平台均不能合规接入；MVP 是否接受 **仅 Demo Adapter + 五平台占位状态**，把完整任务/去重/Telegram/Bark/列表/统计做通？  
3. **乐天市场官方 API**：是否作为**额外可选平台**（明确标注「乐天市场」，不是「乐天二手」）在 Phase 2 接入？  
4. **「乐天二手」语义**：是否确认指 **ラクマ**，而非乐天市场中古店商品？  
5. **多用户**：MVP 做**单用户本地/自托管**即可，还是需要账号体系？  
6. **界面语言**：中文优先，或中/日双语？  

---

## 12. 下一步

- **你确认本方案（及第 11 节选项）后**，再开始 MVP 编码。  
- 确认前**不会**大规模创建业务代码或伪造成「已支持」的平台采集。
