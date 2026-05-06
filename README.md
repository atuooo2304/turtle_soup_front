<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/5893e7ea-1c1c-4549-a386-ae3cfe8981cd

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local`。主持人可选 **扣子 Coze** 或 **DeepSeek**：
   - **Coze（默认）**：配置 **`COZE_TOKEN`、`COZE_BOT_ID`**（及可选 `COZE_REGION`）；构建变量 **`VITE_HOST_PROVIDER=coze`** 或不写。
   - **DeepSeek**：配置 **`DEEPSEEK_API_KEY`**（及可选 `DEEPSEEK_API_URL`、`DEEPSEEK_MODEL`、`DEEPSEEK_SYSTEM_PROMPT`）；构建变量 **`VITE_HOST_PROVIDER=deepseek`**。密钥仍只用于服务端与本地 Vite 中间件，不会打进前端包。
3. Run the app:
   `npm run dev`

也可使用 **`npx vercel dev`** 在本机同时调试与线上一致的 Serverless API（需已登录 Vercel CLI）。线上需在 Vercel 为 `/api/coze-chat`、`/api/deepseek-chat` 分别配置对应环境变量；切换模型时务必同步修改 **`VITE_HOST_PROVIDER`** 并重新构建前端。

## Web 端（主推）

产品主体为 **浏览器 H5**（[`src/App.tsx`](src/App.tsx)）：顶栏导航 + 响应式布局；**游玩无需登录**。**投稿**（`/api/submissions`）必须携带有效 **`Authorization: Bearer`**：

- **网页用户**：在 Supabase 控制台启用 **Email → Magic Link**，复制 Project URL 与 **anon key** 到本地/Vercel 的 **`VITE_SUPABASE_URL`**、**`VITE_SUPABASE_ANON_KEY`**（见 [.env.example](.env.example)）。将 **Redirect URLs** 设为线上站点（如 `https://你的域名/**`）及本地 `http://localhost:5173/**`。
- **微信小程序 WebView**：仍可通过既有 ticket 交换 JWT 投稿（见下文）。

未登录调用投稿接口将返回 **401**。生产构建与部署须带上述 `VITE_*`，否则无法弹出 Magic Link 登录。

部署：`npm run build`，将 `dist/` 与根目录 `api/` 一并部署到 **Vercel**（或其它支持 Serverless 的平台）；服务端环境变量仍需要 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`ADMIN_SECRET`。

## 微信小程序（可选）

仓库采用 **根目录 Vite Web + 独立子目录 `miniprogram/`** 的微信小程序壳（与「小程序阶段与仓库布局」方案 A 一致）。**微信开发者工具请「导入项目」并选择 `miniprogram` 文件夹**（不要选仓库根目录，以免扫到 `node_modules`）。

采用 **`web-view` 打开已部署的 H5**，[`app.json`](miniprogram/app.json) 已将 **`pages/webview/webview` 设为首页**。打开小程序时会 **`wx.login`** → `POST /api/auth/weixin-mini` 换 ticket → WebView 加载 `/?ticket=` → H5 启动时 **`POST /api/auth/exchange`** 换 access token（见 [`src/lib/authSession.ts`](src/lib/authSession.ts)）。投稿接口 **必须携带 Bearer**（网页为 Supabase JWT，小程序为微信 access JWT）。`pages/index/index` 为备用说明页。

H5 在 **微信小程序 WebView** 内会将 `document.title` 置空，减少微信顶区展示网页标题；**系统状态栏与右侧胶囊**仍由微信客户端绘制，无法去除。在普通浏览器打开同一 H5 时标签页标题仍为「海龟汤」（见 [`src/main.tsx`](src/main.tsx)）。

1. 构建并部署 Web：`npm run build`，将 `dist/` 部署到 **https** 域名（需与 Coze 代理同源或按部署文档配置接口域名）。
2. 编辑 [`miniprogram/config.js`](miniprogram/config.js)，将 `h5BaseUrl` 改为该 https 根地址（无尾部斜杠也可）。
3. 在 [微信公众平台](https://mp.weixin.qq.com/) → 开发 → 开发管理 → **业务域名** 中添加上述域名，并按指引放置校验文件。
4. 本地调试：开发者工具 → **详情 → 本地设置** → 可勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」；真机预览须完成业务域名配置。
5. **小程序专用登录**：在 Vercel 配置 `JWT_SECRET`（≥16 字符）、`WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`（与 [.env.example](.env.example) 一致）；并在 Supabase 执行 [`002_submitter_openid.sql`](supabase/migrations/002_submitter_openid.sql)。合法域名需允许同源 **`/api/auth/weixin-mini`**、**`/api/auth/exchange`**。

对局页 [`miniprogram/pages/webview/webview.json`](miniprogram/pages/webview/webview.json) 使用 **`navigationStyle: custom`**，隐藏小程序原生导航栏，使内嵌 H5 尽量全屏展示（以真机为准；IDE 模拟器与真机可能仍有差异）。H5 内对局返回依赖页面内按钮。

### 投稿审核（Supabase + Vercel）

「贡献新汤」在生产环境通过 **同源 `/api/submissions`** 写入 Supabase 表 `riddle_submissions`；**汤谱**由构建内 [`src/data/riddles.csv`](src/data/riddles.csv) 与 **`GET /api/riddles-published`**（`status = approved`）合并展示。管理员审核通过后，用户刷新 H5 即可看到新谜题（小程序 WebView 同理）。

**上线前环境检查（与 Vercel 同项目）**

1. `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（**service_role**，勿用 anon）已配置。
2. `ADMIN_SECRET` 已配置且仅你方知晓；管理接口请求头为 `Authorization: Bearer <ADMIN_SECRET>`。
3. **网页投稿**：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（与构建/部署一致）；Supabase 启用 Email Magic Link 并配置 Redirect URLs。
4. **小程序投稿（可选）**：`JWT_SECRET`、`WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`；并已执行 `002_submitter_openid` 迁移。
5. 不含内置审核网页：审核通过任意能发 HTTP 的客户端完成（下文脚本或手动 curl）。

实施步骤：

1. 在 Supabase 项目 **SQL Editor** 中执行 [`supabase/migrations/001_riddle_submissions.sql`](supabase/migrations/001_riddle_submissions.sql) 建表；若启用微信登录，再执行 [`002_submitter_openid.sql`](supabase/migrations/002_submitter_openid.sql)。
2. 在 [Vercel](https://vercel.com/) 项目 **Environment Variables** 中配置（勿提交到仓库）：
   - `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（**仅服务端**，用于 `api/` 函数）
   - `ADMIN_SECRET`（随机长字符串，用于管理接口 `Authorization: Bearer …`）
   - 前端构建：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（Magic Link）
   - 可选（小程序）：`JWT_SECRET`、`WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`
3. 将含 `api/` 的代码部署到 Vercel 后，在 [微信公众平台](https://mp.weixin.qq.com/) 为小程序配置 **request 合法域名**（与 H5 业务域名一致的生产域名），否则真机内无法请求 `/api`。
4. **本地开发**：Vite 不提供 `/api`，请在 `.env.local` 设置 `VITE_API_BASE=https://你的生产域名`（无尾斜杠），使浏览器请求已部署的 Vercel API；或使用 `vercel dev` 同源联调。

**仓库脚本（推荐）**：[scripts/admin-review.sh](scripts/admin-review.sh)

```bash
chmod +x scripts/admin-review.sh   # 仅需一次
export ORIGIN='https://你的生产根域名'    # 无尾斜杠
export ADMIN_SECRET='与 Vercel 中 ADMIN_SECRET 一致'
./scripts/admin-review.sh pending
./scripts/admin-review.sh approve <投稿uuid>
# ./scripts/admin-review.sh reject <uuid>      # 可选 NOTE='驳回原因'
./scripts/admin-review.sh published            # 验收：公开接口返回的 JSON，含已通过谜题
```

**等价 curl**（将 `ORIGIN` 换为生产根 URL，`ID` 换为待审投稿的 `uuid`）：

```bash
export ADMIN_SECRET='你的密钥'
curl -sS -H "Authorization: Bearer $ADMIN_SECRET" "$ORIGIN/api/admin/submissions?status=pending"
curl -sS -X PATCH -H "Authorization: Bearer $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"status":"approved","reviewer_note":"ok"}' "$ORIGIN/api/admin/submissions/$ID"
# 驳回：-d '{"status":"rejected","reviewer_note":"原因"}'
```

`GET /api/admin/submissions?status=all` 可查看全部状态（脚本命令：`./scripts/admin-review.sh all`）。

**审核通过后让用户看到新题**：前端仅在进入页面时拉取一次 `GET /api/riddles-published`，用户需 **刷新 H5 / 重新打开小程序 WebView** 后汤谱才会更新。

投稿记录在客户端仍会写入 **localStorage** 作展示缓存；状态以服务端为准，可通过再次 PATCH 后让用户重新打开应用拉取汤谱列表。

**与 CSV**：已审核内容**不会自动写回** [`src/data/riddles.csv`](src/data/riddles.csv)；汤谱依赖 **静态 CSV + 已发布 API**。若需离线仅靠 CSV，须另行导出或脚本合并（不在当前自动化路径内）。

小游戏（`game.json` 等）与本目录无关；若只做小程序，忽略仓库名中的 minigame 即可。

## Coze 主持与通关判定

- 对局由扣子 Bot 主持；环境变量与 `.env.example` 一致。
- 前端在 [`src/App.tsx`](src/App.tsx) 的 `hostIndicatesSuccess` 中根据**主持人口播关键词**判断是否弹出结算；若你在 Coze 里修改通关话术（如「解谜成功！」），请同步更新该函数内的关键词列表，或后续改为 BFF 返回结构化字段。
