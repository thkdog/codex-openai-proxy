# codex-openai-proxy

把本机 Codex 登录态代理成 OpenAI 兼容接口。

本服务会读取本地认证文件，然后把请求转发到 `https://chatgpt.com/backend-api/codex/*`，对外提供 OpenAI 风格接口，方便直接接入官方 OpenAI SDK 或现有 OpenAI 生态工具。

当前支持：

- `GET /health`
- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/chat/completions`

## Quick Start

### 1. 准备前置条件

- Node.js 18+
- 本机已经登录 Codex / ChatGPT，并存在认证文件
- 默认认证文件路径：`~/.codex/auth.json`

可以先确认认证文件是否存在：

```bash
ls ~/.codex/auth.json
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动服务

使用默认配置启动：

```bash
npm run dev
```

默认监听地址：

```text
http://127.0.0.1:8787
```

启动成功后，终端会打印：

- 服务地址
- 使用中的认证文件路径
- 健康检查地址
- 模型列表地址
- OpenAI SDK `baseURL`
- 可直接复制的 `curl` 验证命令

## 启动参数

本项目现在只支持命令行参数，不再读取环境变量。

开发模式：

```bash
npm run dev -- --help
```

生产模式：

```bash
npm run build
npm run start -- --help
```

支持参数：

- `-H, --host <host>`：监听地址，默认 `127.0.0.1`
- `-p, --port <port>`：监听端口，默认 `8787`
- `-a, --auth-file <path>`：认证文件路径，默认 `~/.codex/auth.json`

示例：

```bash
npm run dev -- --host 0.0.0.0 --port 9000
```

使用自定义认证文件：

```bash
npm run dev -- --auth-file /absolute/path/to/auth.json
```

同时指定全部参数：

```bash
npm run dev -- --host 0.0.0.0 --port 9000 --auth-file /absolute/path/to/auth.json
```

## 启动后验证

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

查看模型列表：

```bash
curl http://127.0.0.1:8787/v1/models
```

根路径说明页：

```bash
curl http://127.0.0.1:8787/
```

## curl 示例

非流式 `chat/completions`：

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-5-codex",
    "messages": [
      { "role": "user", "content": "Reply with exactly ok" }
    ]
  }'
```

流式 `chat/completions`：

```bash
curl -N http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-5-codex",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Reply with exactly ok" }
    ]
  }'
```

非流式 `responses`：

```bash
curl http://127.0.0.1:8787/v1/responses \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-5-codex",
    "input": [
      {
        "type": "message",
        "role": "user",
        "content": [
          { "type": "input_text", "text": "Reply with exactly ok" }
        ]
      }
    ]
  }'
```

## OpenAI SDK 示例

先安装官方 SDK：

```bash
npm install openai
```

`chat/completions` 示例：

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dummy",
  baseURL: "http://127.0.0.1:8787/v1",
});

const result = await client.chat.completions.create({
  model: "gpt-5-codex",
  messages: [
    { role: "user", content: "Reply with exactly ok" },
  ],
});

console.log(result.choices[0]?.message?.content);
```

`responses` 示例：

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "dummy",
  baseURL: "http://127.0.0.1:8787/v1",
});

const result = await client.responses.create({
  model: "gpt-5-codex",
  input: "Reply with exactly ok",
});

console.log(result.output_text);
```

## 启动失败时的常见原因

认证文件不存在：

- 默认路径不是 `~/.codex/auth.json`
- 你可以通过 `--auth-file` 显式指定

认证文件格式不正确：

- 文件内容不是合法 JSON
- 或缺少 `tokens.access_token`
- 或缺少 `tokens.account_id`

端口不可用：

- 传入的 `--port` 不是 1 到 65535 的整数
- 或端口已被其他进程占用

Codex 登录态失效：

- `/health` 正常但 `/v1/models` 请求失败
- 这种情况通常需要重新登录 Codex / ChatGPT 以刷新本地认证文件
