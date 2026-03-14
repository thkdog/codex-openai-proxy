/*
 * 实现逻辑说明：
 * 这里集中定义对外兼容的 OpenAI 请求结构与对内 Codex backend-api 所需的最小类型，
 * 让路由层、转换层、后端客户端共用同一批类型，避免在不同文件里散落结构定义。
 */

export type OpenAIMessageContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "input_text";
      text: string;
    };

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAIMessageContentPart[];
  tool_call_id?: string;
};

export type OpenAIResponsesInputMessage = {
  type: "message";
  role: "system" | "user" | "assistant" | "tool";
  content: Array<{
    type: "input_text" | "output_text";
    text: string;
  }>;
};

export type OpenAIResponsesRequest = {
  model?: string;
  instructions?: string;
  input?: OpenAIResponsesInputMessage[];
  stream?: boolean;
  temperature?: number;
};

export type OpenAIChatCompletionsRequest = {
  model?: string;
  messages?: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
};

export type CodexResponsesRequest = {
  model: string;
  store: false;
  stream: true;
  instructions?: string;
  input: OpenAIResponsesInputMessage[];
  text: {
    verbosity: "low" | "medium" | "high";
  };
  include: string[];
  prompt_cache_key?: string;
  tool_choice: "auto";
  parallel_tool_calls: boolean;
  temperature?: number;
};

export type CodexModelEntry = {
  slug: string;
  display_name?: string;
  description?: string;
};

export type CodexEvent =
  | {
      type: "codex.rate_limits";
      [key: string]: unknown;
    }
  | {
      type:
        | "response.created"
        | "response.in_progress"
        | "response.completed"
        | "response.failed"
        | "response.incomplete";
      response?: Record<string, unknown>;
      [key: string]: unknown;
    }
  | {
      type: "response.output_text.delta";
      delta?: string;
      [key: string]: unknown;
    }
  | {
      type: "response.output_text.done";
      text?: string;
      [key: string]: unknown;
    }
  | {
      type: "response.output_item.done";
      item?: Record<string, unknown>;
      [key: string]: unknown;
    }
  | {
      type: "error";
      error?: {
        type?: string;
        message?: string;
      };
      status?: number;
      [key: string]: unknown;
    };
