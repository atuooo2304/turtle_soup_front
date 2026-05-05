import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleOptions } from '../_lib/cors.js';
import { parseJsonBody } from '../_lib/parseJsonBody.js';
import { isWeChatAuthConfigured, signTicketToken } from '../_lib/wechatJwt.js';

function json(res: VercelResponse, status: number, body: unknown): void {
  applyCors(res);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

/**
 * 小程序 `wx.login` 拿到的 code → 换一次性 ticket JWT（供 WebView H5 换 access token）。
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!isWeChatAuthConfigured()) {
    json(res, 503, { error: '服务端未配置微信登录（JWT_SECRET、WECHAT_MINI_APPID、WECHAT_MINI_SECRET）' });
    return;
  }
  try {
    const raw = parseJsonBody(req);
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      json(res, 400, { error: '请求体须为 JSON 对象' });
      return;
    }
    const rawCode = (raw as Record<string, unknown>).code;
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!code) {
      json(res, 400, { error: '缺少 code' });
      return;
    }

    const appid = process.env.WECHAT_MINI_APPID!.trim();
    const secret = process.env.WECHAT_MINI_SECRET!.trim();
    const qs = new URLSearchParams({
      appid,
      secret,
      js_code: code,
      grant_type: 'authorization_code',
    });
    const wxRes = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${qs.toString()}`);
    const wxJson = (await wxRes.json()) as Record<string, unknown>;
    if (typeof wxJson.errcode === 'number' && wxJson.errcode !== 0) {
      const msg = typeof wxJson.errmsg === 'string' ? wxJson.errmsg : 'code2session 失败';
      console.error('[api/auth/weixin-mini]', wxJson);
      json(res, 401, { error: msg, errcode: wxJson.errcode });
      return;
    }
    const openid = typeof wxJson.openid === 'string' ? wxJson.openid : '';
    if (!openid) {
      json(res, 502, { error: '微信未返回 openid' });
      return;
    }

    const ticket = await signTicketToken(openid);
    if (!ticket) {
      json(res, 500, { error: '签发 ticket 失败' });
      return;
    }
    json(res, 200, { ticket, expiresIn: 300 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/auth/weixin-mini]', e);
    json(res, 500, { error: '服务器错误', details: msg });
  }
}
