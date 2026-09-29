# 多平台商品上新监控与提醒工具 — 技术方案（第一步）

> 状态：**待确认**。本文件仅为方案，确认前不进行大规模代码实现。  
> 调研日期：2026-09-29  
> 仓库：`thanhluongle2018-spec/tixing`（当前仅有 GPL-3.0 `LICENSE`，无既有应用代码）

---

## 1. 当前项目结构与技术栈

### 1.1 仓库现状

| 项目 | 现状 |
|------|------|
| 代码 | 无（仅 `LICENSE` + `.git`） |
| 提交历史 | `Initial commit`（GPL-3.0） |
| 包管理 / 框架 | 无 |
| 数据库 / CI / 文档 | 无 |
| 许可 | GNU GPL-3.0 |

结论：**绿场项目**。不存在可复用的后端、前端、调度或采集代码，需从零搭建，但不会“覆盖现有业务代码”（因为没有）。

### 1.2 建议技术栈（待确认）

| 层级 | 建议 | 理由 |
|------|------|------|
| 语言 | **TypeScript（全栈）** | 前后端共享类型（任务、商品、平台枚举、通知 payload）；adapter 接口清晰 |
| API | **Fastify** 或 **Hono**（Node 20+） | 轻量、类型友好；也可改用 Python FastAPI（若你更偏好 Python） |
| 前端 | **React + Vite** | 后台管理型 UI，无需 SSR；开发快 |
| ORM / DB | **Prisma + SQLite（本地）/ PostgreSQL（生产）** | 迁移清晰；MVP 本地零依赖可用 SQLite |
| 调度 | **节点内 Scheduler + 任务队列表**（MVP）；后续可换 BullMQ/Redis | 单机可跑；失败恢复靠 DB 状态机，不依赖外部队列 |
| 测试 | **Vitest** | 单元测 adapter / 去重 / 通知 |
| 配置 | **dotenv + zod 校验** | 密钥不进源码；启动时校验必需环境变量 |

备选（若你明确偏好）：Python FastAPI + SQLAlchemy + Alembic + React。架构边界不变，仅实现语言不同。

**默认推荐：TypeScript 全栈**，下文目录与模块按此描述。

---

## 2. 整体架构与模块边界

```
┌─────────────┐     ┌──────────────────────────────────────────┐
│  Web UI     │────▶│  API (tasks / items / channels / stats)   │
└─────────────┘     └───────────────┬──────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────────┐
                    │  Scheduler（按任务间隔拉取 due jobs）      │
                    │  - 并发限制 / 全局限流 / 超时 / 退避重试     │
                    └───────────────┬──────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
      PlatformAdapter         Dedup/Store            Notifier
      (mercari / …)           (items + seen)         (tg/bark/…)
              │                     │                     │
              └─────────────────────┴─────────────────────┘
                                    │
                              SQLite / Postgres
```

### 2.1 模块职责

| 模块 | 职责 | 不负责 |
|------|------|--------|
| **API** | CRUD 任务、渠道配置、商品查询、统计、测试通知 | 不直接抓站 |
| **Scheduler** | 选出到期任务、加锁、调用 adapter、写入结果、触发通知 | 不含平台解析逻辑 |
| **Platform Adapter** | `search(query) → ProductCandidate[]`；声明能力与支持状态 | 不发通知、不写业务表（由上层写入） |
| **Dedup** | `(platform, external_id)` 或 URL 归一化唯一键 | — |
| **Notifier** | 各渠道独立发送、重试、记状态 | 不感知平台细节 |
| **Config/Secrets** | 环境变量加载与校验 | 不落盘明文密钥到仓库 |

### 2.2 关键不变量（幂等）

1. 同一 `(platform, external_id)` 只创建一条 `items` 记录。  
2. 同一 `(item_id, channel_id)` 只产生一条成功通知（或有限重试后的终态）。  
3. Scheduler 用 `check_runs` + 乐观锁 / `FOR UPDATE`，重复调度不重复通知。  
4. 平台 adapter 返回的“已见商品”再次出现时静默跳过。

---

## 3. 数据表设计（草案）

### 3.1 `monitor_tasks`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid/pk | |
| name | text | 任务名 |
| platforms | json/text[] | 平台列表，如 `["suruga_ya"]` |
| keywords | json | 字符串数组，支持中/日/英 |
| price_min / price_max | int nullable | 日元或统一最小货币单位 |
| brand / model / category / seller | text nullable | 可选筛选 |
| interval_minutes | int | 允许值：1 / 5 / 10 / 30（30 秒仅后续开放） |
| status | enum | `active` / `paused` / `error` |
| last_checked_at | datetime nullable | |
| next_check_at | datetime nullable | |
| last_error | text nullable | |
| created_at / updated_at | datetime | |

### 3.2 `items`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid/pk | |
| platform | text | |
| external_id | text | 平台商品 ID |
| url | text | 商品链接 |
| title | text nullable | 允许部分字段缺失 |
| price | int nullable | |
| currency | text | 默认 `JPY` |
| image_url | text nullable | |
| seller | text nullable | |
| posted_at | datetime nullable | 平台发布时间 |
| discovered_at | datetime | 本系统发现时间 |
| raw | json nullable | 原始片段（脱敏后） |
| **unique** | `(platform, external_id)` | 去重核心 |

### 3.3 `task_item_matches`

任务与商品关联（一词多任务、统计用）。  
`unique(task_id, item_id)`。

### 3.4 `notification_channels`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid/pk | |
| type | enum | `telegram` / `bark` / `dingtalk` / `feishu` / `wecom` / `email` / `webhook` |
| name | text | |
| config | json **加密或仅存非密钥引用** | Token 优先放环境变量 / 密钥表 |
| enabled | bool | |
| created_at / updated_at | | |

补充：`channel_secrets` 或环境变量映射（如 `TELEGRAM_BOT_TOKEN`），**禁止**把 token 写入日志。

### 3.5 `task_channels`

`task_id` ↔ `channel_id` 多对多。

### 3.6 `notifications`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid/pk | |
| item_id / channel_id / task_id | fk | |
| status | enum | `pending` / `sent` / `failed` / `dead` |
| attempts | int | |
| last_error | text nullable | |
| sent_at | datetime nullable | |
| **unique** | `(item_id, channel_id)` | 防重复通知 |

### 3.7 `check_runs`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid/pk | |
| task_id | fk | |
| started_at / finished_at | | |
| status | enum | `running` / `success` / `failed` |
| items_found | int | |
| error | text nullable | |
| lock_token | text nullable | 防并发双跑 |

### 3.8 `platform_registry`（可选配置表或代码常量）

记录每个平台的 `support_status`：`supported` / `needs_auth` / `unsupported` / `planned`，**UI 只展示真实状态**。

---

## 4. 建议目录结构

```text
/
├── apps/
│   ├── api/                 # HTTP API + scheduler 进程入口
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/    # task, item, notify orchestration
│   │   │   ├── scheduler/
│   │   │   └── index.ts
│   │   └── package.json
│   └── web/                 # React + Vite 管理台
│       ├── src/
│       │   ├── pages/       # Tasks / Items / Channels / Dashboard
│       │   └── components/
│       └── package.json
├── packages/
│   ├── shared/              # 共享类型、zod schema、平台枚举
│   ├── platform-adapters/   # 各平台 adapter + 接口
│   │   ├── src/
│   │   │   ├── types.ts     # PlatformAdapter interface
│   │   │   ├── registry.ts  # 支持状态注册
│   │   │   ├── demo/        # MVP 可运行的演示数据源
│   │   │   ├── mercari/
│   │   │   ├── rakuten_furima/
│   │   │   ├── yahoo_fleamarket/
│   │   │   ├── yahoo_auctions/
│   │   │   └── suruga_ya/
│   │   └── …
│   └── notifiers/           # telegram / bark / …
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── docs/
│   ├── PROPOSAL.md          # 本文件
│   ├── PLATFORM_STATUS.md   # 平台支持状态（实现后维护）
│   └── SETUP.md             # 本地启动（第二步编写）
├── .env.example
├── package.json             # pnpm workspace
└── README.md
```

原则：**平台采集逻辑不得写入 scheduler**；新平台 = 实现 `PlatformAdapter` + 在 registry 登记状态。

---

## 5. 各平台数据来源、可行性与限制

> 原则：优先官方 API / 授权源；**不绕过验证码、登录墙、反爬**；无可持续且允许的来源则标为「暂不支持」或「需要授权」，并保留 adapter 占位。

### 5.1 汇总表

| 平台 | 官方公开检索 API | 登录需求 | 反爬 / 限制 | 服务条款倾向 | 建议状态 |
|------|------------------|----------|-------------|--------------|----------|
| 煤炉 Mercari | **无**（C2C）；Mercari Shops API 仅店家自店 | 公开浏览通常无需登录；自动化易触发风控 | 强反爬 / App API 非公开 | 禁止未经许可的自动化访问与商业利用服务数据 | **暂不建议实现** |
| 乐天二手（楽天フリマ） | **无**；楽天 Web Service **明确排除** flea / C2C | — | — | 无公开 Furima 搜索 API | **暂不建议实现** |
| 雅虎闲置（Yahoo!フリマ） | **无**（Developer Network 仅有购物等） | — | App/BFF 非公开 | 无公开数据源 | **暂不建议实现** |
| 雅虎日拍（ヤフオク） | **公开拍卖 Web API 已于 2018–2020 终止**；现存多为**店铺/签约** API | 公开页可浏览；自动化有风控 | 频率限制 | 需商务授权才可持续 | **需要平台授权** |
| 骏河屋 Suruga-ya | **无**官方开发者 API / RSS | 搜索页通常可匿名访问 | 可能有 Cloudflare 等 | 通贩规约未明文写“禁止爬虫”，但也**未授权**自动化采集；稳定性与合规风险自担 | **需要进一步调查 / 默认暂不接入** |
| 闪电市场 | 按需求暂不接入 | — | — | — | **明确不做（V1）** |

### 5.2 分平台说明

#### 煤炉（Mercari / jp.mercari.com）

1. **数据来源**：无面向公众的 C2C 商品搜索官方 API。Mercari Shops GraphQL API（`api.mercari-shops.com`）面向**店铺运营**（自有商品/订单），不适用于监控全站他人上新。第三方“Mercari API”均为非官方封装/抓取。  
2. **登录 / 反爬**：正式接口非公开；高频访问易被封禁；存在验证与风控。  
3. **条款**：加盟店/平台条款禁止未经书面许可、以非官方手段访问服务及商业利用内容；US 等条款明确禁止 scraper/crawler。  
4. **完整度 / 成本**：非官方抓取维护成本极高、随时失效，且合规风险高。  
5. **结论**：**暂不建议实现**。保留 `mercari` adapter 占位，`support_status = unsupported`。

#### 乐天二手（楽天フリマ）

1. **数据来源**：楽天公开的 [Ichiba Item Search API](https://webservice.rakuten.co.jp/) **明确排除** flea market / C2C / auction 商品。  
2. **注意**：若用户实际需要的是**乐天市场（Ichiba）新品/店铺商品**监控，则官方 API **已验证可实现**（需申请 Application ID，遵守 rate limit）。这与“二手フリマ”不是同一产品。  
3. **结论**：楽天フリマ → **暂不建议实现**；楽天市场（可选扩展）→ **已验证可实现（需确认产品范围）**。

#### 雅虎闲置（Yahoo!フリマ / 原 PayPayフリマ）

1. **数据来源**：Yahoo! デベロッパーネットワーク当前公开 API 含购物、地图、文本等，**无フリマ公开搜索 API**。客户端走内部 BFF，非授权不可用。  
2. **结论**：**暂不建议实现**（占位 `yahoo_fleamarket`）。

#### 雅虎日拍（Yahoo!オークション）

1. **数据来源**：官方曾提供拍卖 Web API，[已公告终止公开提供](https://developer.yahoo.co.jp/changelog/2017-11-20-auction158.html)（2018 起；评价等残留接口亦于约 2020 关闭）。业界信息表明**签约商家/工具**仍可能有合同制 API，**个人开发者不可自助开通**。  
2. **第三方**：Parse / Apify / ReefAPI 等为非官方封装，本质依赖抓取，不符合“优先官方/明确允许”的原则。  
3. **结论**：**需要平台授权**。无授权前 `support_status = needs_auth`，不实现抓取。

#### 骏河屋（suruga-ya.jp）

1. **数据来源**：无公开官方 API/RSS；社区仅有非官方 HTML 解析库。国际站 suruga-ya.com 同样无开发者门户。  
2. **登录 / 反爬**：搜索多可匿名；部分环境 reportedly 有挑战页。  
3. **条款**：通贩规约以购物/个人信息为主，**未发现明确的“允许自动化监控”授权**；也未像部分平台那样用英文条款明文列举 scraper 禁止——但仍不构成“明确允许”。  
4. **结论**：默认 **暂不接入生产采集**；若你书面确认接受“仅公开页、严格限流、无绕过反爬、随时可能中断”的风险，可列为**第二阶段试点**并单独评审。占位 `suruga_ya`，状态 `needs_review`。

### 5.3 通知渠道可行性（MVP 相关）

| 渠道 | 状态 | 说明 |
|------|------|------|
| Telegram Bot | **已验证可实现** | Bot API 官方、稳定 |
| Bark | **已验证可实现** | HTTP 推送，自托管/官方服务 |
| 钉钉 / 飞书 / 企微机器人 | **已验证可实现**（第二阶段） | Webhook 文档公开 |
| Email | **已验证可实现**（第二阶段） | SMTP / 事务邮件服务 |
| 通用 Webhook | **已验证可实现**（第二阶段） | 用户自备 endpoint |
| 公众号 / 个人微信 / 微信机器人 | **暂不建议 / 需另案** | 无稳定、可持续的个人微信直推官方方案；不假设可做 |

---

## 6. MVP 范围与分阶段计划

### 6.1 核心矛盾与 MVP 策略

目标平台在「官方、可持续、条款允许」前提下，**当前没有可直接接入的 C2C 检索 API**。  
因此 MVP 采用 **“完整监控内核 + 诚实平台状态 + 可运行演示数据源”**，避免空壳平台冒充“已支持”。

### 6.2 Phase 0 — 方案确认（本阶段）

- 输出本方案；**等待你确认**后再写业务代码。

### 6.3 Phase 1 — MVP（确认后实现）

**包含：**

- 监控任务 CRUD、启用/暂停、删除  
- 关键词（多语言字符串）、价格区间、品牌/型号/分类/卖家可选字段  
- 间隔选项：1 / 5 / 10 / 30 分钟；全局并发限制、超时、退避、限流  
- **Demo Adapter**（固定/可配置的模拟上新流），用于端到端验证调度、去重、通知  
- 商品保存、去重、列表筛选、详情外链  
- Telegram + Bark 通知（含测试发送、分渠道失败隔离、有限重试、状态记录）  
- Dashboard：任务数、商品数、通知成功率、各平台**登记状态**  
- Prisma 迁移、`.env.example`、`docs/SETUP.md`、`docs/PLATFORM_STATUS.md`  
- 测试：scheduler 幂等、去重、demo adapter、telegram/bark notifier（可 mock HTTP）

**平台展示规则：**

- UI 显示五个目标平台，但状态均为 `unsupported` / `needs_auth` / `needs_review`  
- **不可选为“已启用采集”**，除非状态变为 `supported`  
- 仅 `demo`（及未来真正 `supported` 的平台）可被任务勾选运行

**不包含：**

- 对 Mercari / 楽天フリマ / Yahoo フリマ / ヤフオク / 骏河屋 的未授权抓取  
- 闪电市场、自动收藏、自动下单  
- 公众号/个人微信推送  
- 30 秒频率  

### 6.4 Phase 2 — 通知与体验扩展

- 钉钉、飞书、企微、Email、通用 Webhook  
- 通知模板（图片、多语言标题）  
- 更细的统计与 check_run 历史页  

### 6.5 Phase 3 — 平台逐个合法接入

每个平台单独开 issue / PR，必须满足：

1. 书面确认数据来源类型（官方 API / 合同授权 / 明确允许）  
2. 实现独立 adapter + 测试  
3. 更新 `PLATFORM_STATUS.md` 为 `supported` 后才在 UI 可选  

候选路径：

| 路径 | 条件 |
|------|------|
| ヤフオク签约 API | 你取得 LINE Yahoo 商务授权 |
| 楽天市场 Ichiba | 你确认监控范围可扩展到非フリマ；申请 RWS App ID |
| 骏河屋试点 | 你确认接受合规与中断风险 + 我们完成 robots/条款再评估 + 极低频 |
| 第三方授权数据商 | 仅当你接受其服务条款与费用，并在文档中标明“非平台官方” |

---

## 7. 功能可行性分类（明确列表）

### 7.1 已验证可实现

- 任务 / 商品 / 去重 / 调度 / 统计等**产品内核**  
- **Telegram Bot**、**Bark** 通知  
- Demo 数据源驱动的端到端监控闭环  
- （可选扩展）**楽天市场 Ichiba** 官方商品搜索 API（**不是**楽天フリマ）  
- 钉钉 / 飞书 / 企微 Webhook、Email、通用 Webhook（工程上已验证，排 Phase 2）

### 7.2 需要平台授权或进一步调查

- **雅虎日拍**：需商务/店铺合同 API 或官方替代数据源  
- **骏河屋**：无官方 API；公开页采集需进一步条款/robots/频率与稳定性评估，默认不进 MVP  
- **Mercari Shops**：仅当监控对象是**用户自己的 Shop** 时，官方 GraphQL 可用（与“全站上新监控”目标不符）  
- 付费第三方 listing API：需你方商务与合规确认  

### 7.3 暂不建议实现（V1 / 默认）

- 煤炉 C2C 全站抓取或非官方 API 封装  
- 楽天フリマ抓取  
- 雅虎闲置抓取  
- 未授权的ヤフオク抓取  
- 绕过验证码 / 登录墙 / 反爬  
- 闪电市场  
- 自动收藏、自动下单  
- 公众号 / 个人微信 / 非官方微信机器人“稳定直推”  
- 默认全平台 30 秒或 1 分钟高频（1 分钟仅对已支持且限流允许的源开放，且受全局限流约束）

---

## 8. 工程与安全约定（实现时遵守）

- Token、密码、Cookie **不进仓库、不进日志**；提供 `.env.example` 占位  
- 失败恢复：进程重启后根据 `next_check_at` / `check_runs` 继续；不因重跑重复通知  
- 速率：每平台独立 limiter + 全局 semaphore；adapter 超时（如 15–30s）  
- GPL-3.0：衍生代码需遵守 GPL-3.0 义务（若你希望改为更宽松许可，需你自行处理 LICENSE）  

---

## 9. 需要你确认的问题

请直接回复确认或调整，确认后我再进入第二步实现：

1. **技术栈**：同意 **TypeScript 全栈（Fastify/Hono + React + Prisma + SQLite）**，还是改用 Python FastAPI？  
2. **MVP 策略**：同意 **内核 + Demo Adapter + 五平台诚实占位（不抓未授权源）** 吗？  
3. **楽天范围**：是否要把 **楽天市场（Ichiba，官方 API）** 作为可选平台加入 MVP/Phase 2？还是严格只要フリマ（则维持暂不支持）？  
4. **骏河屋**：是否允许在 Phase 3 做“公开搜索页 + 严格限流”的试点评估，还是一律等官方授权？  
5. **部署形态**：优先 **单机 Docker Compose 本地跑**，是否足够？  
6. **UI 语言**：中文优先，还是中/日双语？

---

## 10. 下一步

- **现在**：停止大规模改代码，等待你对本文档的确认与上述问题的答复。  
- **确认后**：按 Phase 1 实现 MVP，并同步维护 `PLATFORM_STATUS.md`，任何平台未验证前不以“已支持”展示。
