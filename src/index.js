import { handleStatus } from "./status.js";

/**
 * Worker 入口。
 * `wrangler.jsonc` 中 assets.run_worker_first 只把站点根和 /api/* 交给 Worker，
 * 其余路径由静态资源直接返回（public/ 即站点根）。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/status") {
      return handleStatus(env);
    }
    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }
    // html_handling 为 none：站点根显式映射到 index.html
    if (url.pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }

    return env.ASSETS.fetch(request);
  },
};
