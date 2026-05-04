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
2. Copy [.env.example](.env.example) to `.env.local` and set `COZE_TOKEN`, `COZE_BOT_ID`（参见示例中说明）
3. Run the app:
   `npm run dev`

## 微信小程序（非小游戏）

仓库采用 **根目录 Vite Web + 独立子目录 `miniprogram/`** 的微信小程序壳（与「小程序阶段与仓库布局」方案 A 一致）。**微信开发者工具请「导入项目」并选择 `miniprogram` 文件夹**（不要选仓库根目录，以免扫到 `node_modules`）。

首阶段用 **`web-view` 打开已部署的 H5**（与计划中的「壳 + 联调」一致），[`app.json`](miniprogram/app.json) 已将 **`pages/webview/webview` 设为首页**，打开小程序即进入 H5；`pages/index/index` 为备用说明页。后续可再逐步做原生页、`wx.login` 与 BFF。

H5 在 **微信小程序 WebView** 内会将 `document.title` 置空，减少微信顶区展示网页标题；**系统状态栏与右侧胶囊**仍由微信客户端绘制，无法去除。在普通浏览器打开同一 H5 时标签页标题仍为「海龟汤」（见 [`src/main.tsx`](src/main.tsx)）。

1. 构建并部署 Web：`npm run build`，将 `dist/` 部署到 **https** 域名（需与 Coze 代理同源或按部署文档配置接口域名）。
2. 编辑 [`miniprogram/config.js`](miniprogram/config.js)，将 `h5BaseUrl` 改为该 https 根地址（无尾部斜杠也可）。
3. 在 [微信公众平台](https://mp.weixin.qq.com/) → 开发 → 开发管理 → **业务域名** 中添加上述域名，并按指引放置校验文件。
4. 本地调试：开发者工具 → **详情 → 本地设置** → 可勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」；真机预览须完成业务域名配置。

对局页 [`miniprogram/pages/webview/webview.json`](miniprogram/pages/webview/webview.json) 使用 **`navigationStyle: custom`**，隐藏小程序原生导航栏，使内嵌 H5 尽量全屏展示（以真机为准；IDE 模拟器与真机可能仍有差异）。H5 内对局返回依赖页面内按钮。

H5「贡献新汤 / 投稿记录」当前将投稿保存在 **浏览器 localStorage**（本机），清除微信或站点数据会丢失；与正式题库 `riddles.csv` 无关。

小游戏（`game.json` 等）与本目录无关；若只做小程序，忽略仓库名中的 minigame 即可。

## Coze 主持与通关判定

- 对局由扣子 Bot 主持；环境变量与 `.env.example` 一致。
- 前端在 [`src/App.tsx`](src/App.tsx) 的 `hostIndicatesSuccess` 中根据**主持人口播关键词**判断是否弹出结算；若你在 Coze 里修改通关话术（如「解谜成功！」），请同步更新该函数内的关键词列表，或后续改为 BFF 返回结构化字段。
