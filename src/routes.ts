/*
 * 实现逻辑说明：
 * 这里提供对外兼容的 OpenAI 风格 HTTP 路由和根路径说明页：
 * - /
 * - /health
 * - /v1/models
 * - /v1/responses
 * - /v1/chat/completions
 * 并把请求统一转换后代理到 Codex backend-api，再把结果改写为标准响应。
 */

import type { FastifyInstance, FastifyReply } from "fastify";

import {
  collectCodexResponseEvents,
  fetchCodexModels,
  streamCodexResponseToSSE,
} from "./codex-client.js";
import {
  buildCodexResponsesRequestFromChatCompletions,
  buildCodexResponsesRequestFromResponses,
  collectTextFromCodexEvents,
  createChatCompletion,
  createChatCompletionChunk,
  createChatCompletionDoneChunk,
  createOpenAIResponsesOutput,
  normalizeModelName,
} from "./transform.js";
import type { CodexEvent, OpenAIChatCompletionsRequest, OpenAIResponsesRequest } from "./types.js";

function writeSSE(reply: FastifyReply, data: unknown) {
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function logIgnoredParameters(
  logger: FastifyInstance["log"] | FastifyReply["log"],
  body: Record<string, unknown>,
  allowedKeys: string[],
) {
  const ignoredKeys = Object.keys(body).filter((key) => !allowedKeys.includes(key));

  if (ignoredKeys.length > 0) {
    logger.warn(`忽略未支持的 OpenAI 参数: ${ignoredKeys.join(", ")}`);
  }
}

function writeSSEError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  writeSSE(reply, {
    error: {
      message,
      type: "proxy_error",
    },
  });
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const host = request.headers.host ?? "127.0.0.1:8787";
    const baseUrl = `${request.protocol}://${host}`;

    return {
      name: "codex-openai-proxy",
      message: "本服务把本地 Codex 登录态代理为 OpenAI 兼容接口。",
      endpoints: {
        health: `${baseUrl}/health`,
        models: `${baseUrl}/v1/models`,
        responses: `${baseUrl}/v1/responses`,
        chatCompletions: `${baseUrl}/v1/chat/completions`,
      },
      openai: {
        baseURL: `${baseUrl}/v1`,
        apiKey: "dummy",
      },
    };
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/v1/models", async () => {
    const result = await fetchCodexModels();
    const items =
      result.models?.map((model) => ({
        id: model.slug,
        object: "model",
        created: 0,
        owned_by: "chatgpt-codex",
      })) ?? [];

    return {
      object: "list",
      data: items,
    };
  });

  app.post<{ Body: OpenAIResponsesRequest }>("/v1/responses", async (request, reply) => {
    logIgnoredParameters(
      request.log,
      (request.body ?? {}) as Record<string, unknown>,
      ["model", "instructions", "input", "stream"],
    );

    const body = buildCodexResponsesRequestFromResponses(request.body ?? {});

    if (request.body?.stream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });

      try {
        await streamCodexResponseToSSE(body, reply, (event: CodexEvent) => {
          writeSSE(reply, event);
        });

        reply.raw.write("data: [DONE]\n\n");
      } catch (error) {
        request.log.error(error);
        writeSSEError(reply, error);
        reply.raw.write("data: [DONE]\n\n");
      }

      reply.raw.end();
      return reply;
    }

    const events = await collectCodexResponseEvents(body);
    const text = collectTextFromCodexEvents(events);
    const responseCompletedEvent = events.find((event) => event.type === "response.completed");
    const responseObject = responseCompletedEvent?.response as Record<string, unknown> | undefined;
    const responseIdValue = responseObject?.id;
    const responseId =
      typeof responseIdValue === "string"
        ? responseIdValue
        : `resp_${Date.now()}`;

    return createOpenAIResponsesOutput(responseId, text);
  });

  app.post<{ Body: OpenAIChatCompletionsRequest }>(
    "/v1/chat/completions",
    async (request, reply) => {
      logIgnoredParameters(
        request.log,
        (request.body ?? {}) as Record<string, unknown>,
        ["model", "messages", "stream"],
      );

      const body = buildCodexResponsesRequestFromChatCompletions(request.body ?? {});
      const model = normalizeModelName(request.body?.model);

      if (request.body?.stream) {
        const responseId = `chatcmpl_${Date.now()}`;

        reply.hijack();
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });

        try {
          await streamCodexResponseToSSE(body, reply, (event: CodexEvent) => {
            if (event.type === "response.output_text.delta" && event.delta) {
              writeSSE(reply, createChatCompletionChunk(responseId, model, event.delta));
            }
            if (event.type === "response.completed") {
              writeSSE(reply, createChatCompletionDoneChunk(responseId, model));
            }
          });

          reply.raw.write("data: [DONE]\n\n");
        } catch (error) {
          request.log.error(error);
          writeSSEError(reply, error);
          reply.raw.write("data: [DONE]\n\n");
        }

        reply.raw.end();
        return reply;
      }

      const events = await collectCodexResponseEvents(body);
      const text = collectTextFromCodexEvents(events);
      const responseCompletedEvent = events.find((event) => event.type === "response.completed");
      const responseObject = responseCompletedEvent?.response as Record<string, unknown> | undefined;
      const responseIdValue = responseObject?.id;
      const responseId =
        typeof responseIdValue === "string"
          ? responseIdValue
          : `chatcmpl_${Date.now()}`;

      return createChatCompletion(responseId, model, text);
    },
  );
}
