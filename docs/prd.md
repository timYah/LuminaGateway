# PRD: 模型透传与 Convert 路由（OpenAI Responses / Realtime / Claude / Gemini）

## 1. 背景与问题
当前网关主要提供 `/v1/*` 标准化路由，并在内部进行协议转换与编排。为与 newapi 风格保持一致，同时满足“默认透传 + 可选转换”的需求，需要新增 4 类模型路由与对应的 `/convert` 路由。核心诉求是：
- 透传路由：原样转发请求与响应，尽量不改动数据。
- convert 路由：验证透传响应是否符合目标格式，若不符合则执行格式转换。

## 2. 目标
- 为 4 类模型提供 newapi 风格透传路由。
- 为 4 类模型提供 `/convert` 路由，按目标格式进行校验与必要转换。
- 维持现有 `/v1/*`、`/codex/*`、`/claude/*` 路由不变，兼容历史调用。

## 3. 用户画像与使用场景
- 代理平台/聚合服务调用方，需要统一路径风格并保持透传。
- 需要将不同上游输出统一为指定协议格式的调用方。
- 需要与 newapi 生态保持一致的第三方代理。

## 4. 功能需求（用户故事）

### US-001: OpenAI Responses 透传与转换
**描述：** 作为调用方，我需要通过 OpenAI Responses 路由透传请求，并可在 `/convert` 路由获得强制格式输出。

**验收标准：**
- [ ] 透传路由 `POST /openai/v1/responses` 可用。
- [ ] convert 路由 `POST /convert/openai/v1/responses` 可用。
- [ ] convert 路由对响应进行格式校验与必要转换。
- [ ] `npm run lint`、`npm run typecheck`、`npm run test` 全部通过。

### US-002: OpenAI Realtime 透传与转换
**描述：** 作为调用方，我需要通过 Realtime 路由进行 WebSocket 透传。

**验收标准：**
- [ ] 透传路由 `GET /openai/v1/realtime` 支持 WebSocket 代理。
- [ ] convert 路由 `GET /convert/openai/v1/realtime` 存在且透传 WS 数据。
- [ ] 不对 WebSocket 帧进行转换（仅透传）。
- [ ] `npm run lint`、`npm run typecheck`、`npm run test` 全部通过。

### US-003: Claude Messages 透传与转换
**描述：** 作为调用方，我需要通过 Claude Messages 透传请求，并在 `/convert` 路由获得 Claude 格式输出。

**验收标准：**
- [ ] 透传路由 `POST /claude/v1/messages` 可用。
- [ ] convert 路由 `POST /convert/claude/v1/messages` 可用。
- [ ] convert 路由对响应进行格式校验与必要转换。
- [ ] `npm run lint`、`npm run typecheck`、`npm run test` 全部通过。

### US-004: Gemini 透传与转换
**描述：** 作为调用方，我需要通过 Gemini 透传请求，并在 `/convert` 路由获得 Gemini 格式输出。

**验收标准：**
- [ ] 透传路由 `POST /google/v1beta/models/{model}:generateContent` 可用。
- [ ] convert 路由 `POST /convert/google/v1beta/models/{model}:generateContent` 可用。
- [ ] convert 路由对响应进行格式校验与必要转换。
- [ ] `npm run lint`、`npm run typecheck`、`npm run test` 全部通过。

## 5. 功能需求（Functional Requirements）
- FR-1: 新增 4 类透传路由，路径遵循 newapi 风格：`POST /openai/v1/responses`、`GET /openai/v1/realtime`（WebSocket 透传）、`POST /claude/v1/messages`、`POST /google/v1beta/models/{model}:generateContent`。
- FR-2: 每条透传路由新增对应 convert 路由，路径为 `/convert` + 原路径：`POST /convert/openai/v1/responses`、`GET /convert/openai/v1/realtime`、`POST /convert/claude/v1/messages`、`POST /convert/google/v1beta/models/{model}:generateContent`。
- FR-3: 透传路由默认原样返回上游响应（body 与 headers 保持原样，去除 hop-by-hop headers）。
- FR-4: convert 路由仅对 **非流式 JSON 响应** 进行校验和转换。
- FR-5: convert 路由若返回 JSON 且不符合目标格式，则尝试识别输入格式（OpenAI Responses / Claude Messages / Gemini 任意一种）并转换到目标格式。
- FR-6: 无法识别或无法转换时，返回 `422` + `gateway_error`。
- FR-7: 所有新路由都需遵循现有鉴权、限流、配额、健康与故障转移策略。

## 6. 非目标（Out of Scope）
- 不改动现有 `/v1/*` 标准化路由行为。
- 不实现 WebSocket 数据帧转换（Realtime convert 仅透传）。
- 不在 convert 路由中处理 SSE/流式转换。
- 不新增 Admin UI 变更。

## 7. 设计与交互（可选）
- 无前端 UI 变更需求。

## 8. 技术考虑
- 复用现有 failover 逻辑与鉴权/限流/配额模块。
- 新增协议识别与响应转换函数，建议使用统一的 Universal 响应结构。
- WebSocket 代理需要在 Hono + Node Server 中处理 `upgrade` 请求。
- 新增路由需添加到 CORS 与 middleware 适用范围。

## 9. 成功指标
- 新增 8 条路由全部可用。
- convert 路由在响应不匹配时可完成正确转换。
- 现有测试全部通过，新路由覆盖测试可复用或新增。

## 10. 风险与缓解
- 风险：响应格式识别误判。
- 缓解：先校验目标格式，失败后按优先级尝试识别，无法识别则返回 422。

## 11. 验收标准
- [ ] 新增 4 类透传路由与 4 类 convert 路由。
- [ ] 所有新路由具备鉴权、限流、配额、熔断与 failover。
- [ ] convert 路由能对 JSON 响应进行校验与转换。
- [ ] 现有 `/v1/*`、`/codex/*`、`/claude/*` 行为不变。
- [ ] `npm run lint && npm run typecheck && npm run test` 全部通过。
