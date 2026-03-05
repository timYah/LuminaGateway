# 📑 Lumina Gateway — 产品需求文档 (PRD)

## 1. 产品概述

**Lumina Gateway** 是一个基于 TypeScript 构建的高性能 LLM 聚合网关。它将分散在不同 Provider（OpenAI、Anthropic、Google、第三方中转站等）的余额整合在一起，通过统一的后端接口（兼容 OpenAI 与 Anthropic 双协议）对外提供服务，并具备智能的**余额感知路由**与**自动降级**能力。

### 1.1 目标用户

独立开发者或小团队，需要将多个 LLM 账号的剩余额度聚合使用，避免手动切换 API Key 和重复对接。

### 1.2 非目标（v1 不做）

- 前端 UI 管理后台（仅 API + CLI 管理）
- 多租户 / 用户鉴权体系
- Prompt 缓存或语义缓存层
- 自定义模型微调或模型托管

---

## 2. 核心功能

### 2.1 协议网关 — 统一 API 入口

| 端点 | 格式 | 说明 |
|------|------|------|
| `POST /v1/chat/completions` | OpenAI | 标准 OpenAI Chat Completions 接口 |
| `POST /v1/messages` | Anthropic | 标准 Anthropic Messages 接口 |

- **透明转换**：无论上游 Provider 使用何种协议，网关负责将请求参数（`system`、`messages`、`tools`、`temperature`、`max_tokens`）和响应流（SSE）进行标准化映射。
- **流式支持**：完整 SSE 流式响应，按客户端请求格式输出（OpenAI `data: {...}` 或 Anthropic `event: content_block_delta`）。

### 2.2 智能路由 — "The Switch"

- **余额优先路由**：在所有服务该模型的活跃 Provider 中，优先选择余额最高者；余额相同时按 `priority` 排序。
- **健康感知降级**：
  - `402 (Payment Required)` → 标记余额归零
  - `429 (Rate Limit)` → 触发熔断器，60 秒冷却期
  - `401 (Auth Error)` → 停用该 Provider
  - `5xx (Server Error)` → 触发熔断器，30 秒冷却期
- **秒级重试**：立即尝试下一个候选 Provider，客户端几乎无感。
- **确定性选择**：给定相同数据库状态，始终选择同一个 Provider（可测试）。

### 2.3 计费引擎

- **实时扣费**：通过 Vercel AI SDK 的 `onFinish` 回调获取 `usage`（`promptTokens`、`completionTokens`），按公式计算成本并扣减 Provider 余额。
- **公式**：`cost = (inputTokens / 1M) × inputPrice + (outputTokens / 1M) × outputPrice`
- **多维度定价**：每个 Provider 的每个模型可独立设置 `inputPrice` 和 `outputPrice`（USD / 1M tokens）。
- **审计日志**：每次调用写入 `usageLogs` 表，记录 Provider、模型、Token 数、费用、状态码、延迟。

### 2.4 灵活数据存储

- **Drizzle ORM 驱动**：支持 SQLite（本地文件，默认）和 PostgreSQL（云端数据库）。
- **配置化切换**：通过环境变量 `DATABASE_TYPE` 零代码切换驱动。

---

## 3. 数据库设计

### 3.1 表结构

**providers**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自动递增 |
| `name` | TEXT | Provider 名称（如 "OpenAI Main"） |
| `protocol` | TEXT | `openai` / `anthropic` / `google` |
| `baseUrl` | TEXT | API 基础地址 |
| `apiKey` | TEXT | 加密存储的 API Key |
| `balance` | REAL | 当前余额（USD） |
| `isActive` | BOOLEAN | 启用/停用开关 |
| `priority` | INTEGER | 手动优先级（越小越优先） |
| `createdAt` | TIMESTAMP | 创建时间 |
| `updatedAt` | TIMESTAMP | 更新时间 |

**models**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自动递增 |
| `providerId` | INTEGER FK | 关联 providers.id |
| `slug` | TEXT | 外部模型名（如 `gpt-4o`） |
| `upstreamName` | TEXT | 上游实际模型名 |
| `inputPrice` | REAL | 输入单价（USD / 1M tokens） |
| `outputPrice` | REAL | 输出单价（USD / 1M tokens） |

**usageLogs**
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | 自动递增 |
| `providerId` | INTEGER FK | 关联 providers.id |
| `modelSlug` | TEXT | 请求的模型名 |
| `inputTokens` | INTEGER | 输入 Token 数 |
| `outputTokens` | INTEGER | 输出 Token 数 |
| `cost` | REAL | 本次费用（USD） |
| `statusCode` | INTEGER | 上游响应状态码 |
| `latencyMs` | INTEGER | 请求延迟（毫秒） |
| `createdAt` | TIMESTAMP | 创建时间 |

---

## 4. 技术架构

### 4.1 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 语言 | TypeScript (strict) | 类型安全，生态丰富 |
| API 框架 | Hono | 轻量、Web Standard、边缘计算友好 |
| AI 交互 | Vercel AI SDK | 统一多 Provider 调用，内建流式与 Tool 支持 |
| ORM | Drizzle ORM | 类型安全、轻量、支持多数据库 |
| 数据库 | SQLite (默认) / PostgreSQL (可选) | SQLite 零配置本地开发，PG 适合生产 |
| 测试 | Vitest | 快速、兼容 Vite 生态 |

### 4.2 请求生命周期

```
Client → Auth Middleware → Format Detection → Model Resolution
       → Provider Router → Protocol Adapter → Upstream Call (AI SDK)
       → Response Relay (SSE) → Billing Hook → Client Response
```

### 4.3 降级流程

```typescript
for (const provider of sortedCandidates) {
  try {
    const response = await callUpstream(provider, request);
    await billUsage(provider, response.usage);
    return response;
  } catch (err) {
    if (isQuotaError(err)) {
      await setBalance(provider, 0);
      continue;
    }
    if (isRateLimitError(err)) {
      circuitBreaker.open(provider, 60_000);
      continue;
    }
    throw err;
  }
}
throw new Error("All providers exhausted");
```

---

## 5. 配置与部署

### 5.1 环境变量

```bash
DATABASE_TYPE=sqlite              # sqlite | postgres
DATABASE_URL=file:./lumina.db     # 或 postgres://user:pass@host/db
GATEWAY_API_KEY=sk-lumina-xxx     # 网关鉴权 Bearer Token
PORT=3000                         # 服务端口
LOG_LEVEL=info                    # debug | info | warn | error
```

### 5.2 快速启动

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
# 验证：curl http://localhost:3000/health
```

---

## 6. 后续规划 (Roadmap)

| 阶段 | 功能 | 说明 |
|------|------|------|
| v1.1 | UI Dashboard | 管理后台：Provider 管理、账单统计、实时监控 |
| v1.2 | 缓存层 | Redis 缓存 Provider 状态，降低 DB 查询压力 |
| v1.3 | 并发控制 | 限制单 Provider 并发请求数，防止触发 Rate Limit |
| v2.0 | 多租户 | 支持多用户、独立 API Key、用量配额 |
| v2.1 | Prompt 路由 | 基于 Prompt 内容智能选择最优模型 |

---

## 7. 代理执行文档 (Agent Docs)

本项目采用 [OpenAI Codex "Durable Project Memory" 模式](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) 组织代理执行文档，详见 `docs/` 目录：

| 文件 | 用途 |
|------|------|
| [`docs/prompt.md`](docs/prompt.md) | **项目规格书** — 冻结目标，防止代理"做出令人印象深刻但错误的东西" |
| [`docs/plans.md`](docs/plans.md) | **里程碑计划** — 13 个分阶段里程碑，含验收标准、验证命令、架构概述、风险登记 |
| [`docs/implement.md`](docs/implement.md) | **执行手册** — 告诉代理如何运作：跟踪计划、保持小 diff、运行验证、更新文档 |
| [`docs/documentation.md`](docs/documentation.md) | **共享记忆 & 审计日志** — 当前状态、决策记录、运行命令、已知问题 |
| [`AGENTS.md`](AGENTS.md) | **代理入口** — 仓库级指引，技术栈、工作流、验证命令、代码规范 |
