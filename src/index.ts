/*
 * 实现逻辑说明：
 * 这里收敛服务启动能力，负责根据外部传入的启动配置做认证文件自检、
 * 初始化 Fastify、注册 OpenAI 兼容路由，并在启动成功后输出清晰的接入说明，
 * 供 CLI 入口和后续可能的程序化调用复用同一套启动逻辑。
 */

import Fastify from "fastify";

import { resolveCodexAuthFilePath, validateCodexAuthFile } from "./auth.js";
import { configureCodexClient } from "./codex-client.js";
import { registerRoutes } from "./routes.js";

export type StartServerOptions = {
  host: string;
  port: number;
  authFile: string;
};

function printStartupSummary(options: StartServerOptions) {
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

export async function startServer(options: StartServerOptions) {
  const normalizedOptions = {
    host: options.host,
    port: options.port,
    authFile: resolveCodexAuthFilePath(options.authFile),
  };
  const validated = validateCodexAuthFile(normalizedOptions.authFile);

  configureCodexClient({ authFilePath: validated.authPath });

  const app = Fastify({
    logger: true,
  });

  await registerRoutes(app);
  await app.listen({ host: normalizedOptions.host, port: normalizedOptions.port });

  printStartupSummary({
    host: normalizedOptions.host,
    port: normalizedOptions.port,
    authFile: validated.authPath,
  });

  return app;
}
