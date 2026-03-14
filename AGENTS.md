# AGENTS.md

## 项目目标

这是一个本地 OpenAI 兼容代理服务。

- 对外暴露 OpenAI 风格接口
- 对内读取 `~/.codex/auth.json`
- 使用其中的 `access_token` 和 `account_id`
- 把请求代理到 `https://chatgpt.com/backend-api/codex/*`

当前已实现接口：

- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/chat/completions`

## 开发约束

- 业务代码文件顶部需要保留“实现逻辑说明”注释
- 默认使用 TypeScript
- 优先保持最小依赖
- 如果没有必要，不要引入重量级框架
- 优先兼容官方 OpenAI SDK 的调用方式

## 认证约束

- 不实现 OAuth 登录流程
- 不要求用户提供 `OPENAI_API_KEY`
- 直接读取 `~/.codex/auth.json`
- 如果后续增加 token refresh，也应基于本地 auth 文件已有字段处理

## 代理约束

- 对外接口尽量贴近 OpenAI 标准格式
- 对内请求遵循 Codex backend-api 的真实请求格式
- `chat/completions` 可以通过内部转换映射到 `codex/responses`
- 流式响应优先保持 SSE 兼容

## 当前边界

第一版不覆盖以下能力：

- embeddings
- images
- files
- realtime
- assistants

## 代码组织建议

- `src/auth.ts`：本地认证文件读取
- `src/codex-client.ts`：Codex backend-api 通信
- `src/transform.ts`：OpenAI 与 Codex 结构转换
- `src/routes.ts`：对外 HTTP 路由
- `src/index.ts`：服务启动入口
