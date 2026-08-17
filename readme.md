# 个人导航页（Personal Navigation）

部署在 Cloudflare Pages 上的极简个人导航站，作为个人服务与项目的统一入口。

第一版（MVP）已完成并上线。

## 功能

- 首页导航卡片，按「关于 / 项目 / 服务」分类
- 三态主题切换（自动 / 浅色 / 深色），首屏同步定稿，无闪烁
- 头像随主题切换并带淡出过渡
- 服务状态页：展示各项自建服务最近 30 天可用率
- PC / 移动端响应式布局
- 推送到 GitHub 后由 Cloudflare Pages 自动部署

## 技术方案

| 层 | 选型 |
| --- | --- |
| 页面 | 原生 HTML + CSS，无前端框架、无构建步骤 |
| 交互 | 原生 JavaScript（主题切换、状态页渲染） |
| 后端 | Cloudflare Pages Functions（仅 `/api/status` 一个端点） |
| 数据源 | UptimeRobot API v2 |
| 托管 | Cloudflare Pages + 自定义域名 |

## 目录结构

```text
personal_navigation/
├── index.html              # 首页
├── status.html             # 服务状态页
├── _headers                # Cloudflare Pages 响应头（CSP / HSTS / 缓存）
├── css/
│   └── style.css           # 全部样式
├── js/
│   └── theme.js            # 主题切换
├── functions/
│   └── api/
│       └── status.js       # Pages Function：代理 UptimeRobot API
├── assets/
│   ├── headimg/            # 头像
│   └── websiteimg/         # 站点图标
├── docs/                   # 开发文档
└── readme.md
```

## 服务状态页

状态页不直接在前端调用 UptimeRobot，而是经过一层 Pages Function 代理：

```text
status.html ──fetch('/api/status')──> functions/api/status.js ──> UptimeRobot API
```

这样做的原因：

- API 密钥只存在于 Pages 的环境变量中，不进入前端源码与 Git 仓库
- UptimeRobot 官方状态页返回 `X-Frame-Options: DENY`，无法用 iframe 嵌入
- 便于对返回结构做裁剪，错误信息统一脱敏后再返回

Function 会请求最近 30 天（含当天）的 `custom_uptime_ranges`，按 UptimeRobot 中
`分组名/监控名` 的命名约定拆分成分组，返回：

```json
{
  "ok": true,
  "updated": "2026-08-16 12:34",
  "groups": [
    {
      "name": "分组名",
      "monitors": [
        {
          "name": "监控名",
          "status": "up",
          "url": "https://example.com",
          "daily": [{ "date": "2026-07-18", "uptime": 100 }],
          "downEvents": 0
        }
      ]
    }
  ]
}
```

### 必需的环境变量

在 Cloudflare Pages 项目的 **Settings → Environment variables** 中添加：

| 变量名 | 说明 |
| --- | --- |
| `UptimePageApiSecret` | UptimeRobot 的 Read-Only API Key |

未配置时 `/api/status` 返回 500 并附带中文提示，状态页会显示加载失败。

> 不要把密钥写入仓库任何文件。若密钥曾经泄露，需在 UptimeRobot 侧重新生成。

## 本地预览

纯静态部分用任意静态服务器即可（`status.html` 会因为拿不到 `/api/status` 而显示加载失败）：

```powershell
python -m http.server 8080
```

需要连带 Pages Function 一起跑时使用 Wrangler：

```powershell
npx wrangler pages dev . --binding UptimePageApiSecret=<your-key>
```

## 安全说明

[_headers](_headers) 中配置了较严格的响应头：

- `Content-Security-Policy`：`default-src 'none'`，只放行同源的图片、样式、脚本、字体
- 仅对 `/status.html` 额外放行 `connect-src 'self'`，用于同源调用 `/api/status`
- `X-Frame-Options: DENY`、`Strict-Transport-Security`、`Referrer-Policy`、`Permissions-Policy`
- `/assets/*` 缓存 7 天

由于本仓库公开，页面上出现的自建服务入口对外可见。建议这些入口自身启用
Cloudflare Access 或其他认证手段，不要依赖「地址不公开」作为唯一防护。

## 后续计划

第一版不再扩展。以下内容按实际使用需求再决定是否实现：

- 导航搜索与收藏
- 补齐各服务的专属图标（当前部分卡片复用 GitHub 图标）
- 统一首页卡片结构（`.card` 与 `.nav-card` 目前并存）
- 项目详情页 / 个人主页方向的演进

详见 [个人导航页——项目构想与开发计划.md](docs/个人导航页——项目构想与开发计划.md)。
