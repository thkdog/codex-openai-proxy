/*
 * 实现逻辑说明：
 * 这里是服务启动入口，负责通过 commander 解析命令行参数，
 * 对认证文件和端口参数做启动前自检，初始化 Fastify、注册 OpenAI 兼容路由，
 * 并在启动成功后输出清晰的接入说明，方便外部 SDK 按标准 OpenAI baseURL 方式接入。
 */

import { Command, InvalidArgumentError } from "commander";
import Fastify from "fastify";

import { getDefaultCodexAuthFilePath, resolveCodexAuthFilePath, validateCodexAuthFile } from "./auth.js";
import { configureCodexClient } from "./codex-client.js";
import { registerRoutes } from "./routes.js";

type CliOptions = {
  host: string;
  port: number;
  authFile: string;
};

function parsePort(value: string) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError("port 必须是 1 到 65535 之间的整数");
  }

  return port;
}

function getCliOptions(): CliOptions {
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

  return {
    host: options.host,
    port: options.port,
    authFile: resolveCodexAuthFilePath(options.authFile),
  };
}

function printStartupSummary(options: CliOptions) {
  const serviceUrl = `http://${options.host}:${options.port}`;

  console.log("");
  console.log("codex-openai-proxy 已启动");
  console.log(`服务地址: ${serviceUrl}`);
  console.log(`认证文件: ${options.authFile}`);
  console.log(`健康检查: ${serviceUrl}/health`);
  console.log(`模型列表: ${serviceUrl}/v1/models`);
  console.log(`OpenAI baseURL: ${serviceUrl}/v1`);
  console.log("");
  console.log("快速验证:");
  console.log(`curl ${serviceUrl}/health`);
  console.log(`curl ${serviceUrl}/v1/models`);
  console.log("");
  console.log("OpenAI SDK 配置:");
  console.log(`baseURL = "${serviceUrl}/v1"`);
  console.log('apiKey = "dummy"');
  console.log("");
}

async function main() {
  const options = getCliOptions();
  const validated = validateCodexAuthFile(options.authFile);

  configureCodexClient({ authFilePath: validated.authPath });

  const app = Fastify({
    logger: true,
  });

  await registerRoutes(app);
  await app.listen({ host: options.host, port: options.port });

  printStartupSummary({
    host: options.host,
    port: options.port,
    authFile: validated.authPath,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`启动失败: ${message}`);
  process.exit(1);
});
