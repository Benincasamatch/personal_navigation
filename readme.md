# 个人导航页（Personal Navigation）

部署在 Cloudflare Pages 上的个人入口站：首页是一场关于时间的粒子实验（沙漏），
导航页汇总自建服务与项目。

第一版（MVP）已完成并上线；首页已迁移为沙漏视觉页（见下方「首页与导航页」）。

## 功能

- 首页：WebGL2 粒子沙漏（自动降级为 Canvas 2D 静态画面），无控制按钮，随页面生命周期停帧
- 首页服务星标：三颗星标按画面分散排布（参照 stencil-clone 的 `landing-star`），配「全部链接与项目」入口
- 导航页（`nav.html`）：按「关于 / 项目 / 服务」分类的卡片
- 三态主题切换（自动 / 浅色 / 深色），首屏同步定稿，无闪烁（导航页 / 状态页）
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
├── index.html              # 首页：粒子沙漏 + 导航快捷入口
├── nav.html                # 导航页（原首页）：关于 / 项目 / 服务卡片
├── status.html             # 服务状态页
├── _headers                # Cloudflare Pages 响应头（CSP / HSTS / 缓存）
├── css/
│   ├── sandglass.css       # 首页样式（Stencil 风格 + 入口面板）
│   └── style.css           # 导航页 / 状态页样式
├── js/
│   ├── sandglass.js        # 首页粒子沙漏（WebGL2，Canvas 2D 降级）
│   └── theme.js            # 主题切换
├── functions/
│   └── api/
│       └── status.js       # Pages Function：代理 UptimeRobot API
├── assets/
│   ├── fonts/              # 首页字体（Geist / Instrument Sans / Ioskeley Mono）
│   ├── headimg/            # 头像
│   └── websiteimg/         # 站点图标
├── docs/                   # 开发文档
└── readme.md
```

## 首页与导航页

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 首页 | `index.html` | 粒子沙漏（迁移自 `particle_sandglass` 项目），服务星标分散在画面中，「全部链接与项目」进入导航页 |
| 导航页 | `nav.html` | 原首页内容完整保留：头像、关于 / 项目 / 服务卡片，左上角可返回首页 |
| 状态页 | `status.html` | 服务可用性监控，经 Pages Function 代理 UptimeRobot |

首页粒子渲染要点：

- WebGL2 一次实例化绘制约 3 万个粒子（玻璃轮廓 / 落沙 / 沙堆 / 底座），
  不支持 WebGL2 时回落为 Canvas 2D 的静态一次性绘制
- 几何随视口宽度连续插值，不做断点切换；宽度 ≤ 640px 使用手机版构图
- 尊重 `prefers-reduced-motion`：开启后只保留静态画面，不启动动画
- 星标动效沿用参考站：尖端闪烁、悬停点亮火花、进场时标签逐格擦入
- 样式、脚本、字体全部是同源静态文件，不依赖内联脚本，符合 `_headers`
  中的 `default-src 'none'` 策略；字体位于 `assets/fonts/`，由
  `css/sandglass.css` 的 `@font-face` 引用

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
