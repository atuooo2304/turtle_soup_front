/**
 * 检测是否运行在微信小程序 web-view 内（与微信内置浏览器不同）。
 * 用于关闭 Web Speech API 等小程序 WebView 不支持或不可靠的能力。
 */
export function isWeChatMiniProgramWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const env = (window as Window & { __wxjs_environment?: string }).__wxjs_environment;
  if (env === 'miniprogram') return true;
  if (typeof navigator === 'undefined') return false;
  return /miniProgram/i.test(navigator.userAgent);
}
