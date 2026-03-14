/*
 * 实现逻辑说明：
 * 这里把外部的 OpenAI 标准请求结构转换为 Codex backend-api 的 responses 请求体，
 * 并把 Codex 的事件流改写回标准 OpenAI Responses / Chat Completions 输出格式。
 * 当前仅白名单透传已确认支持的字段，未支持参数由路由层统一记录 warning 后忽略。
 */

import type {
  CodexEvent,
  CodexResponsesRequest,
  OpenAIChatCompletionsRequest,
  OpenAIChatMessage,
  OpenAIResponsesInputMessage,
  OpenAIResponsesRequest,
} from "./types.js";

const DEFAULT_MODEL = "gpt-5-codex";
const DEFAULT_INSTRUCTIONS = "You are a helpful assistant.";

export function normalizeModelName(model?: string) {
  if (!model) return DEFAULT_MODEL;
  return model;
}

function toInputTextParts(content: OpenAIChatMessage["content"]) {
  if (!content) return [];
  if (typeof content === "string") {
    return [{ type: "input_text" as const, text: content }];
  }

  return content
    .filter((part) => part.type === "text" || part.type === "input_text")
    .map((part) => ({
      type: "input_text" as const,
      text: part.text,
    }));
}

export function chatCompletionsToResponsesInput(
  request: OpenAIChatCompletionsRequest,
): { instructions?: string; input: OpenAIResponsesInputMessage[] } {
  const instructions = request.messages
    ?.filter((message) => message.role === "system")
    .flatMap((message) => toInputTextParts(message.content))
    .map((part) => part.text)
    .join("\n");

  const input =
    request.messages
      ?.filter((message) => message.role !== "system")
      .map((message) => ({
        type: "message" as const,
        role: message.role,
        content: toInputTextParts(message.content),
      }))
      .filter((message) => message.content.length > 0) ?? [];

  return {
    instructions: instructions || undefined,
    input,
  };
}

export function buildCodexResponsesRequestFromResponses(
  request: OpenAIResponsesRequest,
): CodexResponsesRequest {
  return {
    model: normalizeModelName(request.model),
    store: false,
    stream: true,
    instructions: request.instructions || DEFAULT_INSTRUCTIONS,
    input: request.input ?? [],
    text: { verbosity: "medium" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
  };
}

export function buildCodexResponsesRequestFromChatCompletions(
  request: OpenAIChatCompletionsRequest,
): CodexResponsesRequest {
  const converted = chatCompletionsToResponsesInput(request);

  return {
    model: normalizeModelName(request.model),
    store: false,
    stream: true,
    instructions: converted.instructions || DEFAULT_INSTRUCTIONS,
    input: converted.input,
    text: { verbosity: "medium" },
    include: ["reasoning.encrypted_content"],
    tool_choice: "auto",
    parallel_tool_calls: true,
  };
}

export function createOpenAIResponsesOutput(responseId: string, text: string) {
  return {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    output: [
      {
        id: `${responseId}_msg`,
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text,
            annotations: [],
          },
        ],
      },
    ],
    model: DEFAULT_MODEL,
  };
}

export function createChatCompletion(responseId: string, model: string, text: string) {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: responseId,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: text,
        },
      },
    ],
  };
}

export function createChatCompletionChunk(responseId: string, model: string, delta: string) {
  return {
    id: responseId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          content: delta,
        },
        finish_reason: null,
      },
    ],
  };
}

export function createChatCompletionDoneChunk(responseId: string, model: string) {
  return {
    id: responseId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
  };
}

export function collectTextFromCodexEvents(events: CodexEvent[]) {
  return events
    .filter((event) => event.type === "response.output_text.delta")
    .map((event) => event.delta ?? "")
    .join("");
}
