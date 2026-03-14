/*
 * 实现逻辑说明：
 * 这里负责解析和读取 ChatGPT/Codex 登录态文件，
 * 默认使用 ~/.codex/auth.json，也支持由启动入口通过命令行参数传入自定义路径，
 * 并统一校验 access_token/account_id 是否齐全，供 backend-api 认证复用。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type RawAuthFile = {
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
};

export type CodexAuth = {
  accessToken: string;
  accountId: string;
};

export function getDefaultCodexAuthFilePath() {
  return path.join(os.homedir(), ".codex", "auth.json");
}

export function resolveCodexAuthFilePath(authFilePath?: string) {
  if (!authFilePath) {
    return getDefaultCodexAuthFilePath();
  }

  return path.resolve(authFilePath);
}

export function validateCodexAuthFile(authFilePath?: string) {
  const authPath = resolveCodexAuthFilePath(authFilePath);

  if (!fs.existsSync(authPath)) {
    throw new Error(`认证文件不存在: ${authPath}`);
  }

  const raw = fs.readFileSync(authPath, "utf8");
  let parsed: RawAuthFile;

  try {
    parsed = JSON.parse(raw) as RawAuthFile;
  } catch {
    throw new Error(`认证文件不是合法 JSON: ${authPath}`);
  }

  const accessToken = parsed.tokens?.access_token;
  const accountId = parsed.tokens?.account_id;

  if (!accessToken || !accountId) {
    throw new Error(`认证文件缺少 access_token 或 account_id: ${authPath}`);
  }

  return {
    authPath,
    auth: {
      accessToken,
      accountId,
    },
  };
}

export function readCodexAuth(authFilePath?: string): CodexAuth {
  return validateCodexAuthFile(authFilePath).auth;
}
