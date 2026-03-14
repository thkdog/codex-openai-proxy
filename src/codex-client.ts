/*
 * 实现逻辑说明：
 * 这里封装对 chatgpt.com/backend-api/codex/* 的访问，包括模型列表 HTTP 请求、
 * 以及 responses 的 WebSocket 调用，并把结果统一转成上层可消费的事件数组或增量回调。
 * 认证信息由启动入口统一配置，避免业务请求层自行猜测认证文件位置。
 */

import type { FastifyReply } from "fastify";

import { readCodexAuth } from "./auth.js";
import type { CodexEvent, CodexModelEntry, CodexResponsesRequest } from "./types.js";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const OPENAI_BETA_RESPONSES_WEBSOCKETS = "responses_websockets=2026-02-06";
let configuredAuthFilePath: string | undefined;

function createRequestId() {
  return `codex_proxy_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function configureCodexClient(options: { authFilePath?: string }) {
  configuredAuthFilePath = options.authFilePath;
}

function buildBaseHeaders() {
  const auth = readCodexAuth(configuredAuthFilePath);

  return {
    Authorization: `Bearer ${auth.accessToken}`,
    "chatgpt-account-id": auth.accountId,
    originator: "pi",
    "User-Agent": "openai-test (darwin; arm64)",
  };
}

export async function fetchCodexModels() {
  const response = await fetch(`${CODEX_BASE_URL}/codex/models?client_version=0.115.0`, {
    headers: buildBaseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`获取 Codex 模型列表失败: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as { models?: CodexModelEntry[] };
}

export async function collectCodexResponseEvents(body: CodexResponsesRequest) {
  const requestId = createRequestId();
  const headers = buildBaseHeaders();
  const ws = new WebSocket(`${CODEX_BASE_URL.replace("https://", "wss://")}/codex/responses`, {
    headers: {
      ...headers,
      "OpenAI-Beta": OPENAI_BETA_RESPONSES_WEBSOCKETS,
      "x-client-request-id": requestId,
      session_id: requestId,
    },
  } as any);

  const events: CodexEvent[] = [];

  return await new Promise<CodexEvent[]>((resolve, reject) => {
    let completed = false;

    const close = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "response.create", ...body }));
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;

      const parsed = JSON.parse(event.data) as CodexEvent;
      events.push(parsed);

      if (parsed.type === "error") {
        completed = true;
        close();
        reject(new Error(parsed.error?.message ?? "Codex backend 返回错误"));
        return;
      }

      if (parsed.type === "response.completed") {
        completed = true;
        close();
        resolve(events);
      }
    });

    ws.addEventListener("error", () => {
      if (!completed) {
        reject(new Error("Codex WebSocket 连接失败"));
      }
    });

    ws.addEventListener("close", () => {
      if (!completed) {
        reject(new Error("Codex WebSocket 在完成前关闭"));
      }
    });
  });
}

export async function streamCodexResponseToSSE(
  body: CodexResponsesRequest,
  reply: FastifyReply,
  onEvent: (event: CodexEvent) => void,
) {
  const requestId = createRequestId();
  const headers = buildBaseHeaders();
  const ws = new WebSocket(`${CODEX_BASE_URL.replace("https://", "wss://")}/codex/responses`, {
    headers: {
      ...headers,
      "OpenAI-Beta": OPENAI_BETA_RESPONSES_WEBSOCKETS,
      "x-client-request-id": requestId,
      session_id: requestId,
    },
  } as any);

  return await new Promise<void>((resolve, reject) => {
    let done = false;

    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "response.create", ...body }));
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;

      const parsed = JSON.parse(event.data) as CodexEvent;
      onEvent(parsed);

      if (parsed.type === "error") {
        finish(new Error(parsed.error?.message ?? "Codex backend 返回错误"));
        return;
      }

      if (parsed.type === "response.completed") {
        finish();
      }
    });

    ws.addEventListener("error", () => {
      finish(new Error("Codex WebSocket 连接失败"));
    });

    ws.addEventListener("close", () => {
      if (!done) {
        finish(new Error("Codex WebSocket 在完成前关闭"));
      }
    });

    reply.raw.on("close", () => {
      if (!done) {
        finish();
      }
    });
  });
}
