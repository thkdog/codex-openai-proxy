#!/usr/bin/env node
/*
 * 实现逻辑说明：
 * 这里是 npm 包的命令行入口，负责解析 commander 参数、校验端口输入，
 * 并把整理后的启动配置交给服务启动模块，保证本地开发、npx 与全局安装都走同一入口。
 */

import { Command, InvalidArgumentError } from "commander";

import { getDefaultCodexAuthFilePath } from "./auth.js";
import { startServer } from "./index.js";

function parsePort(value: string) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError("port 必须是 1 到 65535 之间的整数");
  }

  return port;
}

async function main() {
  const program = new Command();

  program
    .name("codex-openai-proxy")
    .description("把本地 Codex 登录态代理成 OpenAI 兼容接口")
    .option("-H, --host <host>", "监听地址", "127.0.0.1")
    .option("-p, --port <port>", "监听端口", parsePort, 8787)
    .option("-a, --auth-file <path>", "Codex 认证文件路径", getDefaultCodexAuthFilePath())
    .showHelpAfterError("(可使用 --help 查看完整启动参数)");

  program.parse();

  const options = program.opts<{
    host: string;
    port: number;
    authFile: string;
  }>();

  await startServer({
    host: options.host,
    port: options.port,
    authFile: options.authFile,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`启动失败: ${message}`);
  process.exit(1);
});
