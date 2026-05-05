/**
 * 小程序内嵌 WebView 加载的 H5 根地址（须 https）。
 * 与 `/api/*` 同源：wx.login 后请求 `${h5BaseUrl}/api/auth/weixin-mini`，需在公众平台配置 **request 合法域名**。
 * 1. 将 Web 项目构建并部署到该域名（如 Vercel / 自有服务器）。
 * 2. 登录微信公众平台 → 开发 → 开发管理 → 开发设置 → 业务域名，添加此域名（按指引校验文件）。
 * 3. 本地调试可在开发者工具勾选「不校验合法域名」；真机预览必须配置业务域名。
 */
module.exports = {
  h5BaseUrl: 'https://turtle-soup-front.vercel.app',
};
