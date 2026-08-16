/**
 * Cloudflare Pages Function —— /api/status
 * 代理 UptimeRobot API，密钥从环境变量 UptimePageApiSecret 读取，
 * 避免把 API 密钥暴露在前端源码中。
 *
 * 返回结构：
 * {
 *   "ok": true,
 *   "title": "Service Status",
 *   "updated": "2026-08-16 12:34",
 *   "groups": [ { "name":"组名", "monitors":[ {...} ] } ]
 * }
 */
export async function onRequest(context) {
  const { env } = context;
  const secret = env.UptimePageApiSecret || "";

  if (!secret) {
    return json(
      {
        ok: false,
        error: "服务未配置：缺少 UptimePageApiSecret 环境变量（在 Pages 的 Functions 环境变量中添加）。",
      },
      500
    );
  }

  // 计算出最近 30 天（含今天）的日期与时间戳区间
  const dates = [];
  const now = new Date();
  const todayStr = toYmd(now);
  for (let d = 29; d >= 0; d--) {
    const t = new Date(now);
    t.setDate(t.getDate() - d);
    dates.push(toYmd(t));
  }

  const ranges = [];
  for (const ds of dates) {
    const start = Math.floor(new Date(ds + "T00:00:00").getTime() / 1000);
    ranges.push(start + "_" + (start + 86400));
  }

  const body = new URLSearchParams({
    api_key: secret,
    format: "json",
    logs: "1",
    logs_start_date: String(Math.floor(new Date(dates[0] + "T00:00:00").getTime() / 1000)),
    logs_end_date: String(Math.floor(new Date(dates[29] + "T00:00:00").getTime() / 1000) + 86400),
    custom_uptime_ranges: ranges.join("-"),
  });

  let upstream;
  try {
    upstream = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    return json({ ok: false, error: "无法连接 UptimeRobot API，请稍后再试。" }, 502);
  }

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return json({ ok: false, error: "UptimeRobot API 返回无法解析的数据。" }, 502);
  }

  if (!data || data.stat !== "ok") {
    const msg = data && data.error && typeof data.error.message === "string"
      ? data.error.message
      : "未知错误";
    return json({ ok: false, error: "UptimeRobot API 调用失败：" + msg }, 502);
  }

  const monitors = (data.monitors || []).map((m) => {
    const favName = (m.friendly_name || "").split("/");
    const name = favName.length > 1 ? favName[1] : favName[0];
    const group = favName.length > 1 ? favName[0] : "默认分组";

    const uptimeRanges = (m.custom_uptime_ranges || "")
      .split("-")
      .map((s) => parseFloat(s));

    const daily = dates.map((dateStr, idx) => {
      const uptime = isNaN(uptimeRanges[idx]) ? null : uptimeRanges[idx];
      return { date: dateStr, uptime };
    });

    const downEvents = (m.logs || []).filter(
      (l) => l.type === 1
    ).length;

    // status: 2=up 8/9=down 0=暂停
    let status = "pause";
    if (m.status === 2) status = "up";
    else if (m.status === 8) status = "seemdown";
    else if (m.status === 9) status = "down";

    return {
      name,
      group,
      status,
      url: m.url || null,
      daily,
      downEvents,
    };
  });

  // 按分组归类，保持原始顺序
  const groups = [];
  const seen = new Map();
  for (const mt of monitors) {
    if (!seen.has(mt.group)) {
      seen.set(mt.group, { name: mt.group, monitors: [] });
      groups.push(seen.get(mt.group));
    }
    seen.get(mt.group).monitors.push(mt);
  }

  return json({
    ok: true,
    updated: toYmd(now) + " " + pad(now.getHours()) + ":" + pad(now.getMinutes()),
    groups,
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60", // 允许缓存最多 1 分钟
    },
  });
}

function toYmd(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function pad(n) {
  return String(n).padStart(2, "0");
}
