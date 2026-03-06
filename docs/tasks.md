# Lumina Gateway — Task List

> 每个任务只做一件事。每个阶段以验证任务收尾，验证不通过则持续修复直到通过为止。
> 任务状态标记：`[ ]` 待做 · `[x]` 完成 · `[!]` 阻塞

---

## Phase 01 — 项目脚手架

- [x] **T-01.1** 初始化 `package.json`（`npm init`，设置 `name`、`version`、`type: "module"`）
- [x] **T-01.2** 安装核心依赖：`hono`、`@hono/node-server`
- [x] **T-01.3** 安装开发依赖：`typescript`、`vitest`、`eslint`、`tsx`
- [x] **T-01.4** 创建 `tsconfig.json`，启用 `strict: true`、`ESNext` 模块
- [x] **T-01.5** 创建 ESLint 配置文件（flat config）
- [x] **T-01.6** 在 `package.json` 中添加 scripts：`dev`、`build`、`lint`、`typecheck`、`test`
- [x] **T-01.7** 创建目录结构：`src/`、`src/db/`、`src/routes/`、`src/services/`、`src/middleware/`、`src/types/`、`src/utils/`
- [x] **T-01.8** 创建 `src/app.ts` — Hono app 工厂函数，注册 `GET /health` 返回 `{ status: "ok" }`
- [x] **T-01.9** 创建 `src/index.ts` — 入口文件，读取 `PORT` 环境变量，启动 Hono server
- [x] **T-01.10** 创建 `.env.example` 文件，列出所有环境变量及默认值
- [x] **T-01.11** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`，启动 `npm run dev` 后 `curl http://localhost:3000/health` 返回 200。持续修复直到全部通过。

---

## Phase 02 — 数据库 Schema

- [x] **T-02.1** 安装数据库依赖：`drizzle-orm`、`better-sqlite3`、`drizzle-kit`
- [x] **T-02.2** 安装类型依赖：`@types/better-sqlite3`
- [x] **T-02.3** 创建 `src/db/schema/providers.ts` — 定义 `providers` 表（id, name, protocol, baseUrl, apiKey, balance, isActive, priority, createdAt, updatedAt）
- [x] **T-02.4** 创建 `src/db/schema/models.ts` — 定义 `models` 表（id, providerId FK, slug, upstreamName, inputPrice, outputPrice），添加 `slug` 索引
- [x] **T-02.5** 创建 `src/db/schema/usageLogs.ts` — 定义 `usageLogs` 表（id, providerId FK, modelSlug, inputTokens, outputTokens, cost, statusCode, latencyMs, createdAt），添加 `createdAt` 索引
- [x] **T-02.6** 创建 `src/db/schema/index.ts` — 统一导出所有 schema
- [x] **T-02.7** 创建 `drizzle.config.ts` — Drizzle Kit 配置文件
- [x] **T-02.8** 在 `package.json` 中添加 `db:generate` 和 `db:migrate` scripts
- [x] **T-02.9** 运行 `npm run db:generate` 生成初始迁移文件
- [x] **T-02.10** ✅ **验证**：运行 `npm run db:migrate` 确认表创建成功，运行 `npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 03 — 数据库连接工厂

- [x] **T-03.1** 创建 `src/db/index.ts` — 实现 `getDb()` 工厂函数，根据 `DATABASE_TYPE` 环境变量返回 SQLite 或 PostgreSQL 连接
- [x] **T-03.2** 在 `getDb()` 中为 SQLite 启用 WAL 模式（`pragma journal_mode = WAL`）
- [x] **T-03.3** 创建 `src/db/migrate.ts` — 迁移运行脚本，读取 drizzle 迁移文件并执行
- [x] **T-03.4** ✅ **验证**：运行 `npm run db:migrate` 确认迁移正常执行，运行 `npm run lint && npm run typecheck && npm run test`。持续修复直到全部通过。

---

## Phase 04 — Seed 脚本

- [x] **T-04.1** 创建 `src/db/seed.ts` — 填充至少 3 个 demo Provider（如 "OpenAI Main"、"Anthropic Backup"、"Third-Party Proxy"）
- [x] **T-04.2** 在 seed 脚本中为每个 Provider 添加模型映射（至少 5 条，如 gpt-4o、gpt-4o-mini、claude-sonnet-4-20250514、claude-haiku 等）
- [x] **T-04.3** 在 `package.json` 中添加 `db:seed` script
- [x] **T-04.4** ✅ **验证**：运行 `npm run db:seed` 确认数据写入成功，运行 `npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 05 — Provider 服务层

- [x] **T-05.1** 创建 `src/services/providerService.ts` — 实现 `getAllProviders()` 方法
- [x] **T-05.2** 实现 `getProviderById(id)` 方法
- [x] **T-05.3** 实现 `createProvider(data)` 方法
- [x] **T-05.4** 实现 `updateProvider(id, data)` 方法（支持余额充值、启停切换）
- [x] **T-05.5** 实现 `deactivateProvider(id)` 方法（设置 `isActive = false`）
- [x] **T-05.6** 实现 `deductBalance(id, amount)` 方法（原子操作：`balance = balance - amount`）
- [x] **T-05.7** ✅ **验证**：编写 `src/services/__tests__/providerService.test.ts`，覆盖所有方法，运行 `npm run test -- providerService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 06 — Model 服务层

- [x] **T-06.1** 创建 `src/services/modelService.ts` — 实现 `getModelsBySlug(slug)` 方法，返回匹配 slug 的所有模型记录（含关联 Provider 信息）
- [x] **T-06.2** 实现 `getActiveProvidersByModel(slug)` 方法 — 返回服务该模型的活跃 Provider 列表，按 `balance DESC, priority ASC` 排序
- [x] **T-06.3** 实现 `getModelByProviderAndSlug(providerId, slug)` 方法 — 获取特定 Provider 的模型定价信息
- [x] **T-06.4** ✅ **验证**：编写 `src/services/__tests__/modelService.test.ts`，覆盖排序确定性和边界情况，运行 `npm run test -- modelService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 07 — Auth 中间件

- [x] **T-07.1** 创建 `src/middleware/auth.ts` — 实现 Bearer Token 中间件，从 `Authorization` 头提取 token 并与 `GATEWAY_API_KEY` 比对
- [x] **T-07.2** 鉴权失败返回 `401` 状态码和标准错误体
- [x] **T-07.3** 缺少 `Authorization` 头时返回 `401`
- [x] **T-07.4** ✅ **验证**：编写 `src/middleware/__tests__/auth.test.ts`，测试有效/无效/缺失 token 三种情况，运行 `npm run test -- auth && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 08 — 请求类型定义

- [x] **T-08.1** 创建 `src/types/openai.ts` — 定义 OpenAI Chat Completion 请求体类型（model, messages, stream, temperature, max_tokens, tools, tool_choice）
- [x] **T-08.2** 在 `src/types/openai.ts` 中定义 OpenAI Chat Completion 响应体类型（非流式）
- [x] **T-08.3** 在 `src/types/openai.ts` 中定义 OpenAI SSE chunk 类型（流式）
- [x] **T-08.4** 创建 `src/types/anthropic.ts` — 定义 Anthropic Messages 请求体类型（model, messages, system, stream, max_tokens, tools）
- [x] **T-08.5** 在 `src/types/anthropic.ts` 中定义 Anthropic Messages 响应体类型（非流式）
- [x] **T-08.6** 在 `src/types/anthropic.ts` 中定义 Anthropic SSE event 类型（流式）
- [x] **T-08.7** ✅ **验证**：运行 `npm run typecheck` 确认所有类型无误，运行 `npm run lint`。持续修复直到全部通过。

---

## Phase 09 — 请求校验（Zod Schemas）

- [x] **T-09.1** 安装依赖：`zod`
- [x] **T-09.2** 创建 `src/types/validators.ts` — 定义 OpenAI 请求体 Zod schema
- [x] **T-09.3** 在 `src/types/validators.ts` 中定义 Anthropic 请求体 Zod schema
- [x] **T-09.4** ✅ **验证**：编写 `src/types/__tests__/validators.test.ts`，测试合法/非法请求体的校验结果，运行 `npm run test -- validators && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 10 — 路由骨架（Stub）

- [x] **T-10.1** 创建 `src/routes/openai.ts` — 注册 `POST /v1/chat/completions` 路由，使用 Zod schema 校验请求体，返回 stub 响应
- [x] **T-10.2** 创建 `src/routes/anthropic.ts` — 注册 `POST /v1/messages` 路由，使用 Zod schema 校验请求体，返回 stub 响应
- [x] **T-10.3** 在 `src/app.ts` 中挂载 auth 中间件和两个路由模块
- [x] **T-10.4** ✅ **验证**：编写 `src/routes/__tests__/routes.stub.test.ts`，测试鉴权、校验、stub 响应，运行 `npm run test -- routes && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 11 — 熔断器

- [x] **T-11.1** 创建 `src/services/circuitBreaker.ts` — 定义 `CircuitBreaker` 类，包含 `open(providerId, cooldownMs)` 方法
- [x] **T-11.2** 实现 `isOpen(providerId)` 方法 — 检查 Provider 是否处于熔断状态
- [x] **T-11.3** 实现 `reset(providerId)` 方法 — 手动重置熔断状态
- [x] **T-11.4** 实现自动过期逻辑 — 超过冷却期后自动关闭熔断器
- [x] **T-11.5** ✅ **验证**：编写 `src/services/__tests__/circuitBreaker.test.ts`，测试开启/过期/重置行为，运行 `npm run test -- circuitBreaker && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 12 — Provider 路由器

- [x] **T-12.1** 创建 `src/services/routerService.ts` — 实现 `selectProvider(modelSlug)` 方法，查询活跃且余额 > 0 的 Provider，按 balance DESC、priority ASC 排序
- [x] **T-12.2** 在 `selectProvider` 中过滤掉熔断器已开启的 Provider
- [x] **T-12.3** 实现 `getAllCandidates(modelSlug)` 方法 — 返回完整排序后的候选列表（用于降级循环）
- [x] **T-12.4** 所有 Provider 耗尽时抛出 `NoProviderAvailableError` 自定义错误
- [x] **T-12.5** ✅ **验证**：编写 `src/services/__tests__/routerService.test.ts`，测试确定性选择、熔断过滤、全部耗尽，运行 `npm run test -- routerService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 13 — AI SDK 工厂

- [x] **T-13.1** 安装依赖：`ai`、`@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/google`
- [x] **T-13.2** 创建 `src/services/aiSdkFactory.ts` — 实现 `createAIProvider(provider)` 函数，根据 `provider.protocol` 创建对应的 AI SDK provider 实例（设置 baseURL 和 apiKey）
- [x] **T-13.3** ✅ **验证**：运行 `npm run typecheck && npm run lint`，确认类型和导入无误。持续修复直到全部通过。

---

## Phase 14 — Upstream 调用服务（非流式）

- [x] **T-14.1** 创建 `src/services/upstreamService.ts` — 实现 `callUpstreamNonStreaming(provider, model, params)` 函数，使用 AI SDK 的 `generateText` 调用上游
- [x] **T-14.2** 从 `generateText` 返回值中提取 `usage`（promptTokens、completionTokens）并返回
- [x] **T-14.3** 实现错误分类函数 `classifyUpstreamError(error)` — 区分 402/429/401/5xx/unknown
- [x] **T-14.4** ✅ **验证**：编写 `src/services/__tests__/upstreamService.test.ts`（使用 mock），测试正常响应和错误分类，运行 `npm run test -- upstreamService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 15 — Upstream 调用服务（流式）

- [x] **T-15.1** 在 `src/services/upstreamService.ts` 中实现 `callUpstreamStreaming(provider, model, params)` 函数，使用 AI SDK 的 `streamText` 调用上游
- [x] **T-15.2** 在 `streamText` 的 `onFinish` 回调中捕获 `usage` 数据
- [x] **T-15.3** 返回一个包含 stream（AsyncIterable）和 usagePromise 的对象
- [x] **T-15.4** ✅ **验证**：编写流式相关测试（mock AI SDK），测试 chunk 迭代和 usage 捕获，运行 `npm run test -- upstreamService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 16 — 计费服务

- [x] **T-16.1** 创建 `src/services/billingService.ts` — 实现 `calculateCost(inputTokens, outputTokens, inputPrice, outputPrice)` 纯函数
- [x] **T-16.2** 实现 `billUsage(providerId, modelSlug, usage, model)` 方法 — 计算费用、扣减余额、写入 usageLogs
- [x] **T-16.3** 处理边界情况：usage 为空时跳过计费、价格为 0 时仅记录日志
- [x] **T-16.4** ✅ **验证**：编写 `src/services/__tests__/billingService.test.ts`，用精确数值验证计算公式、余额扣减、日志写入，运行 `npm run test -- billingService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 17 — Gateway 编排服务（非流式）

- [x] **T-17.1** 创建 `src/services/gatewayService.ts` — 实现 `handleRequest(requestParams, clientFormat)` 方法骨架
- [x] **T-17.2** 在 `handleRequest` 中实现降级循环：遍历候选 Provider，调用 upstream，失败时按错误类型处理（熔断/停用/余额归零）并 continue
- [x] **T-17.3** 成功调用后调用 `billingService.billUsage()` 扣费
- [x] **T-17.4** 将 AI SDK 响应转换为客户端期望的格式（OpenAI 或 Anthropic）并返回
- [x] **T-17.5** 所有 Provider 耗尽时返回格式化的错误响应
- [x] **T-17.6** ✅ **验证**：编写 `src/services/__tests__/gatewayService.test.ts`，测试正常流程、降级流程、全部耗尽，运行 `npm run test -- gatewayService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 18 — 连通路由（非流式完整流程）

- [x] **T-18.1** 在 `src/routes/openai.ts` 中替换 stub 响应，接入 `gatewayService.handleRequest()`（非流式路径）
- [x] **T-18.2** 在 `src/routes/anthropic.ts` 中替换 stub 响应，接入 `gatewayService.handleRequest()`（非流式路径）
- [x] **T-18.3** ✅ **验证**：编写端到端测试 `src/routes/__tests__/e2e.nonstream.test.ts`（mock upstream），测试 OpenAI 和 Anthropic 两种格式的完整请求-响应，运行 `npm run test && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 19 — SSE 流式中继（OpenAI 格式）

- [x] **T-19.1** 创建 `src/services/streamRelay.ts` — 实现 `relayAsOpenAIStream(aiSdkStream)` 函数，将 AI SDK 的 stream 转为 `data: {...}\n\n` 格式的 ReadableStream
- [x] **T-19.2** 在流结束时追加 `data: [DONE]\n\n` 终止标记
- [x] **T-19.3** ✅ **验证**：编写 `src/services/__tests__/streamRelay.openai.test.ts`，测试 chunk 格式和终止标记，运行 `npm run test -- streamRelay && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 20 — SSE 流式中继（Anthropic 格式）

- [x] **T-20.1** 在 `src/services/streamRelay.ts` 中实现 `relayAsAnthropicStream(aiSdkStream)` 函数，将 AI SDK 的 stream 转为 `event: content_block_delta\ndata: {...}\n\n` 格式
- [x] **T-20.2** 在流结束时发送 `event: message_stop` 事件
- [x] **T-20.3** ✅ **验证**：编写 `src/services/__tests__/streamRelay.anthropic.test.ts`，测试 event 格式和终止事件，运行 `npm run test -- streamRelay && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 21 — Gateway 编排服务（流式路径）

- [x] **T-21.1** 在 `src/services/gatewayService.ts` 中实现 `handleStreamingRequest(requestParams, clientFormat)` 方法
- [x] **T-21.2** 实现流式降级逻辑：如果 upstream 在流开始前失败，切换下一个 Provider 重试
- [x] **T-21.3** 流完成后通过 usagePromise 获取 usage 并调用 `billingService.billUsage()` 扣费
- [x] **T-21.4** ✅ **验证**：编写流式 gateway 测试，测试正常流、降级流、计费时序，运行 `npm run test -- gatewayService && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 22 — 连通路由（流式完整流程）

- [x] **T-22.1** 在 `src/routes/openai.ts` 中添加流式路径：当 `stream: true` 时调用 `handleStreamingRequest()` 并返回 SSE Response
- [x] **T-22.2** 在 `src/routes/anthropic.ts` 中添加流式路径：当 `stream: true` 时调用 `handleStreamingRequest()` 并返回 SSE Response
- [x] **T-22.3** 设置正确的 SSE 响应头（`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`）
- [x] **T-22.4** ✅ **验证**：编写端到端流式测试 `src/routes/__tests__/e2e.stream.test.ts`（mock upstream），测试两种格式的完整流式流程，运行 `npm run test && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 23 — 协议转换（OpenAI 方向）

- [x] **T-23.1** 创建 `src/services/protocolConverter.ts` — 实现 `convertOpenAIToUniversal(openaiRequest)` 函数，将 OpenAI 请求体转为 AI SDK 通用参数
- [x] **T-23.2** 实现 `convertUniversalToOpenAIResponse(aiSdkResult)` 函数 — 将 AI SDK 结果包装为 OpenAI 响应格式
- [x] **T-23.3** ✅ **验证**：编写 `src/services/__tests__/protocolConverter.openai.test.ts`，用 fixture 数据测试请求转换和响应包装，运行 `npm run test -- protocolConverter && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 24 — 协议转换（Anthropic 方向）

- [x] **T-24.1** 在 `src/services/protocolConverter.ts` 中实现 `convertAnthropicToUniversal(anthropicRequest)` 函数 — 处理 `system` 字段的位置映射
- [x] **T-24.2** 实现 `convertUniversalToAnthropicResponse(aiSdkResult)` 函数 — 将 AI SDK 结果包装为 Anthropic 响应格式
- [x] **T-24.3** ✅ **验证**：编写 `src/services/__tests__/protocolConverter.anthropic.test.ts`，用 fixture 数据测试双向转换，运行 `npm run test -- protocolConverter && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 25 — 协议转换（Tool Calling）

- [x] **T-25.1** 在 `src/services/protocolConverter.ts` 中实现 `convertToolSchemas(tools, fromFormat, toFormat)` 函数 — 处理 OpenAI 与 Anthropic 的 tool schema 差异
- [x] **T-25.2** 处理 tool_choice / tool_use 结果的格式映射
- [x] **T-25.3** ✅ **验证**：编写 tool calling 相关测试，覆盖 schema 转换和结果映射，运行 `npm run test -- protocolConverter && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 26 — Request ID 生成

- [x] **T-26.1** 创建 `src/utils/requestId.ts` — 实现 `generateRequestId()` 函数（返回唯一 ID，如 `req_` 前缀 + nanoid）
- [x] **T-26.2** ✅ **验证**：运行 `npm run typecheck && npm run lint`。持续修复直到通过。

---

## Phase 27 — 日志中间件

- [x] **T-27.1** 创建 `src/middleware/logger.ts` — 实现结构化日志中间件，记录 request ID、method、path、状态码、耗时
- [x] **T-27.2** 读取 `LOG_LEVEL` 环境变量控制日志级别（debug / info / warn / error）
- [x] **T-27.3** 在响应头中注入 `x-request-id`
- [x] **T-27.4** ✅ **验证**：编写 `src/middleware/__tests__/logger.test.ts`，测试日志输出和响应头，运行 `npm run test -- logger && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 28 — 统一错误处理

- [x] **T-28.1** 创建 `src/middleware/errorHandler.ts` — 实现全局错误处理中间件
- [x] **T-28.2** 根据请求路径判断客户端格式，返回对应的错误体（OpenAI 格式 `{ error: { message, type, code } }` 或 Anthropic 格式 `{ type: "error", error: { type, message } }`）
- [x] **T-28.3** 在 `src/app.ts` 中注册 errorHandler 和 logger 中间件
- [x] **T-28.4** ✅ **验证**：编写 `src/middleware/__tests__/errorHandler.test.ts`，测试两种格式的错误响应，运行 `npm run test -- errorHandler && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 29 — Admin 路由：查询 Provider

- [x] **T-29.1** 创建 `src/routes/admin.ts` — 实现 `GET /admin/providers` 路由，返回所有 Provider 列表（含余额、状态）
- [x] **T-29.2** 在 `src/app.ts` 中挂载 admin 路由，复用 auth 中间件
- [x] **T-29.3** ✅ **验证**：编写 `src/routes/__tests__/admin.list.test.ts`，测试鉴权和返回数据，运行 `npm run test -- admin && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 30 — Admin 路由：创建 Provider

- [x] **T-30.1** 在 `src/routes/admin.ts` 中实现 `POST /admin/providers` 路由，接受 Provider 配置并写入数据库
- [x] **T-30.2** 添加 Zod schema 校验请求体
- [x] **T-30.3** ✅ **验证**：编写 `src/routes/__tests__/admin.create.test.ts`，测试创建成功和校验失败，运行 `npm run test -- admin && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 31 — Admin 路由：更新 Provider

- [x] **T-31.1** 在 `src/routes/admin.ts` 中实现 `PATCH /admin/providers/:id` 路由（支持余额充值、启停切换、修改优先级）
- [x] **T-31.2** 不存在的 Provider ID 返回 `404`
- [x] **T-31.3** ✅ **验证**：编写 `src/routes/__tests__/admin.update.test.ts`，测试更新成功、404、部分字段更新，运行 `npm run test -- admin && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 32 — Admin 路由：查询 Usage

- [x] **T-32.1** 在 `src/routes/admin.ts` 中实现 `GET /admin/usage` 路由，支持按 providerId、modelSlug、startDate、endDate 过滤
- [x] **T-32.2** 支持分页参数（`limit`、`offset`），默认 `limit=50`
- [x] **T-32.3** ✅ **验证**：编写 `src/routes/__tests__/admin.usage.test.ts`，测试过滤和分页，运行 `npm run test -- admin && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 33 — 集成测试：Happy Path

- [x] **T-33.1** 创建 `src/__tests__/integration/` 目录
- [x] **T-33.2** 编写 `src/__tests__/integration/happyPath.test.ts` — 测试完整非流式请求：auth → 路由 → mock upstream 响应 → 计费 → 正确格式返回
- [x] **T-33.3** 验证 usageLogs 中有一条记录，Provider 余额已扣减
- [x] **T-33.4** ✅ **验证**：运行 `npm run test -- integration && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 34 — 集成测试：Failover

- [x] **T-34.1** 编写 `src/__tests__/integration/failover.test.ts` — 测试降级链：Provider A 返回 402 → 自动切换 Provider B → 成功响应
- [x] **T-34.2** 测试所有 Provider 都失败时返回正确的错误格式
- [x] **T-34.3** 测试 429 触发熔断器后，下一次请求跳过该 Provider
- [x] **T-34.4** ✅ **验证**：运行 `npm run test -- integration && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 35 — 集成测试：流式 + 计费

- [x] **T-35.1** 编写 `src/__tests__/integration/streaming.test.ts` — 测试完整流式请求的 SSE 格式正确性
- [x] **T-35.2** 测试流式请求完成后计费正确写入
- [x] **T-35.3** 测试流式请求的降级场景（upstream 连接前失败 → 切换 Provider）
- [x] **T-35.4** ✅ **验证**：运行 `npm run test -- integration && npm run lint && npm run typecheck`。持续修复直到全部通过。

---

## Phase 36 — 文档更新 + 最终验证

- [x] **T-36.1** 更新 `docs/documentation.md` — 确保所有章节反映实际实现
- [x] **T-36.2** 更新 `docs/plans.md` — 勾选所有完成的 Milestone，补充决策日志
- [x] **T-36.3** 创建或更新 `README.md` — 包含项目简介、快速启动、scripts 列表
- [x] **T-36.4** ✅ **最终验证**：依次运行以下命令，全部通过方可标记项目完成。持续修复直到全部通过。
  ```bash
  npm install
  npm run db:migrate
  npm run db:seed
  npm run build
  npm run lint
  npm run typecheck
  npm run test
  npm run dev  # 手动验证 /health 返回 200
  ```

---

## Phase 37 — 管理后台（Vue + Nuxt UI）

- [x] **T-37.0** 更新文档：补充管理后台说明（`docs/documentation.md`、`README.md`、`docs/plans.md`）
- [x] **T-37.1** 初始化 `apps/admin`（Vue 3 + Nuxt UI），提供基础布局和主题样式
- [x] **T-37.2** 配置 Vite dev 代理，将 `/api` 转发到网关
- [x] **T-37.3** 实现 API Key 输入与本地存储，并在请求中注入 `Authorization: Bearer ...`
- [x] **T-37.4** Providers 页面：列表、创建、更新（余额、启用状态、优先级）
- [x] **T-37.5** Usage 页面：过滤条件与分页
- [x] **T-37.6** ✅ **验证**：运行 `cd apps/admin && npm run dev`，手动验证 Providers 与 Usage 流程

---

## Phase 38 — 部署与使用文档

- [x] **T-38.1** 创建 `docs/deployment.md` — 写明部署步骤、环境变量、管理后台运行方式
- [x] **T-38.2** 更新 `docs/documentation.md` — 补充部署与使用文档入口

---

## Phase 39 — 联合启动（Gateway + Admin）

- [x] **T-39.0** 更新任务列表：补充联合启动的实现与验证任务
- [x] **T-39.1** 新增统一启动脚本：`npm run dev` 同时启动 gateway 与 admin
- [x] **T-39.2** 更新文档：补充联合启动的部署与使用说明
- [x] **T-39.3** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`。持续修复直到全部通过。

---

## Phase 40 — Admin 测试与修复

- [x] **T-40.0** 更新任务列表：补充 admin 自动化验证任务
- [x] **T-40.1** 修复 admin 运行时错误，确保页面可加载
- [x] **T-40.2** ✅ **验证**：使用 agent-browser 验证 Providers / Usage 页面与 API Key 流程
- [x] **T-40.3** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`。持续修复直到全部通过。

---

## Phase 41 — 管理后台 UI 优化

- [x] **T-41.0** 更新文档：补充 Admin UI 优化方案（`docs/documentation.md`）
- [x] **T-41.1** 圆角体系收敛：引入 4–8px 半径层级并替换页面与组件圆角
- [x] **T-41.2** 布局优化：标题外置、减少卡片叠加、使用分隔线组织层级
- [x] **T-41.3** 密度调整：收紧间距与表格行高，保持平衡密度
- [x] **T-41.4** ✅ **验证**：运行 `npm run dev` 并使用 agent-browser 截图验证 Providers / Usage

---

## Phase 42 — 环境变量自动加载

- [x] **T-42.1** 加载 `.env`：在 gateway 与脚本入口引入 env loader，支持 `GATEWAY_API_KEY`
- [x] **T-42.2** 文档更新：说明 `.env` 自动加载与推荐配置方式

---

## Phase 43 — New API Provider 支持

- [x] **T-43.1** 支持 new-api 协议：扩展 provider 协议枚举、AI SDK 工厂与 Admin 表单
- [x] **T-43.2** 文档更新：补充 new-api 接入说明与 base URL 指引
- [x] **T-43.3** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 44 — Admin i18n

- [x] **T-44.1** 引入 i18n：集成 vue-i18n，默认英文
- [x] **T-44.2** 文案国际化：覆盖 Admin UI 文案与表单提示
- [x] **T-44.3** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 45 — Admin Provider Fixes

- [x] **T-45.1** 修复 Providers 新增失败后的表单状态：允许重新提交并清理 loading/error
- [x] **T-45.2** 规范 OpenAI/new-api 的 base URL：自动补全 `/v1`
- [x] **T-45.3** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 46 — Admin Providers Load Fix

- [x] **T-46.1** 开启 gateway CORS（允许 Authorization 预检），避免 Admin 跨域请求被拦截
- [x] **T-46.2** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 47 — New-API Non-Streaming Fallback

- [x] **T-47.1** new-api 非流式请求失败时自动回退到流式并聚合返回文本
- [x] **T-47.2** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 48 — Network Failover Logging

- [x] **T-48.1** 将网络错误归类为 server 并输出 failover 日志
- [x] **T-48.2** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 45 — 语言切换

- [x] **T-45.1** 语言切换：增加语言选择器并持久化
- [x] **T-45.2** 新增中文文案：补充 zh 本地化文本
- [x] **T-45.3** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 46 — Admin 表单宽度调整

- [x] **T-46.1** 调整新增提供商协议选择宽度，使其与 API Key 输入一致
- [x] **T-46.2** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 47 — Admin 模型映射

- [x] **T-47.1** 增加模型映射 API：新增 `/admin/models` 列表、创建、更新接口
- [x] **T-47.2** 新增模型映射 UI：在管理后台支持新增与编辑模型映射
- [x] **T-47.3** 补充模型映射测试：覆盖 `/admin/models` 创建、过滤、更新
- [x] **T-47.4** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`
- [x] **T-47.5** 修复 Admin 非 JSON 响应导致空状态的问题
- [x] **T-47.6** 同步仓库状态：提交当前未提交变更
- [x] **T-47.7** 修复 API key 录入兼容 Bearer/变量名的情况
- [x] **T-47.8** 服务端兼容带前缀的 GATEWAY_API_KEY 配置
- [x] **T-47.9** 新增网关地址输入以修复后台连接失败
- [x] **T-47.10** 改为从 .env 读取后台网关地址与 API key
- [x] **T-47.11** 修复 localhost 指向错误服务导致的后台连接失败
- [x] **T-47.12** 移除会话提示横幅

---

## Phase 48 — 余额简化与优先级路由

- [x] **T-48.1** 调整路由与计费：余额视为无限，仅按 `priority` 排序，记录 usage 成本但不扣减余额
- [x] **T-48.2** 更新测试：覆盖路由排序、计费不扣减、配额错误不归零余额
- [x] **T-48.3** 文档更新：同步 spec、plans、documentation 的余额与降级策略说明
- [x] **T-48.4** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 49 — Admin UI 适配

- [x] **T-49.1** 更新 Admin 文案与提示：优先级路由、余额仅作参考
- [x] **T-49.2** 明确模型映射依赖：提示仅映射模型可路由

---

## Phase 50 — Provider 删除

- [x] **T-50.1** 服务端支持 Provider 删除：新增 deleteProvider 服务与 admin delete 路由
- [x] **T-50.2** 测试覆盖 Provider 删除：服务层与 admin 路由
- [x] **T-50.3** Admin UI 增加删除操作与确认
- [x] **T-50.4** 文档更新：补充删除接口说明
- [x] **T-50.5** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## Phase 51 — 移除模型映射

- [x] **T-51.1** 数据库调整：删除 models 表，providers 增加 input/output 价格字段
- [x] **T-51.2** 路由与计费更新：模型直通、价格回退、模型不存在切换
- [x] **T-51.3** Admin API/UI 调整：移除模型映射，补充 provider 定价
- [x] **T-51.4** 测试更新：移除模型映射测试并覆盖新逻辑
- [x] **T-51.5** 文档更新：移除模型映射说明，补充定价与 env
- [x] **T-51.6** ✅ **验证**：运行 `npm run lint && npm run typecheck && npm run test`

---

## 任务统计

| 阶段 | 任务数 | 说明 |
|------|--------|------|
| Phase 01 | 11 | 项目脚手架 |
| Phase 02 | 10 | 数据库 Schema |
| Phase 03 | 4 | 数据库连接工厂 |
| Phase 04 | 4 | Seed 脚本 |
| Phase 05 | 7 | Provider 服务层 |
| Phase 06 | 4 | Model 服务层 |
| Phase 07 | 4 | Auth 中间件 |
| Phase 08 | 7 | 请求类型定义 |
| Phase 09 | 4 | 请求校验 |
| Phase 10 | 4 | 路由骨架 |
| Phase 11 | 5 | 熔断器 |
| Phase 12 | 5 | Provider 路由器 |
| Phase 13 | 3 | AI SDK 工厂 |
| Phase 14 | 4 | Upstream 非流式 |
| Phase 15 | 4 | Upstream 流式 |
| Phase 16 | 4 | 计费服务 |
| Phase 17 | 6 | Gateway 编排（非流式） |
| Phase 18 | 3 | 连通路由（非流式） |
| Phase 19 | 3 | SSE 中继（OpenAI） |
| Phase 20 | 3 | SSE 中继（Anthropic） |
| Phase 21 | 4 | Gateway 编排（流式） |
| Phase 22 | 4 | 连通路由（流式） |
| Phase 23 | 3 | 协议转换（OpenAI） |
| Phase 24 | 3 | 协议转换（Anthropic） |
| Phase 25 | 3 | 协议转换（Tool Calling） |
| Phase 26 | 2 | Request ID |
| Phase 27 | 4 | 日志中间件 |
| Phase 28 | 4 | 统一错误处理 |
| Phase 29 | 3 | Admin 查询 |
| Phase 30 | 3 | Admin 创建 |
| Phase 31 | 3 | Admin 更新 |
| Phase 32 | 3 | Admin Usage |
| Phase 33 | 4 | 集成测试 Happy Path |
| Phase 34 | 4 | 集成测试 Failover |
| Phase 35 | 4 | 集成测试 流式+计费 |
| Phase 36 | 4 | 文档+最终验证 |
| Phase 42 | 2 | 环境变量自动加载 |
| Phase 43 | 3 | New API Provider 支持 |
| Phase 44 | 3 | Admin i18n |
| Phase 45 | 3 | 语言切换 |
| Phase 46 | 2 | Admin 表单宽度调整 |
| Phase 47 | 12 | Admin 模型映射 |
| Phase 48 | 4 | 余额简化与优先级路由 |
| Phase 49 | 2 | Admin UI 适配 |
| Phase 50 | 5 | Provider 删除 |
| Phase 51 | 6 | 移除模型映射 |
| **合计** | **194** | |
