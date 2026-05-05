import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleOptions } from '../_lib/cors.js';
import { parseJsonBody } from '../_lib/parseJsonBody.js';
import {
  cozeUserIdFromOpenid,
  isWeChatAuthConfigured,
  signAccessToken,
  verifyTicketToken,
} from '../_lib/wechatJwt.js';

function json(res: VercelResponse, status: number, body: unknown): void {
  applyCors(res);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

/**
 * WebView H5 用 URL 中的 ticket 换取 accessToken（及 Coze 侧 user_id）。
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
    json(res, 503, { error: '服务端未配置微信登录' });
    return;
  }
  try {
    const raw = parseJsonBody(req);
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      json(res, 400, { error: '请求体须为 JSON 对象' });
      return;
    }
    const rawTicket = (raw as Record<string, unknown>).ticket;
    const ticket = typeof rawTicket === 'string' ? rawTicket.trim() : '';
    if (!ticket) {
      json(res, 400, { error: '缺少 ticket' });
      return;
    }

    const openid = await verifyTicketToken(ticket);
    if (!openid) {
      json(res, 401, { error: 'ticket 无效或已过期，请重新打开小程序' });
      return;
    }

    const accessToken = await signAccessToken(openid);
    if (!accessToken) {
      json(res, 500, { error: '签发 token 失败' });
      return;
    }

    json(res, 200, {
      accessToken,
      expiresIn: 604800,
      cozeUserId: cozeUserIdFromOpenid(openid),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/auth/exchange]', e);
    json(res, 500, { error: '服务器错误', details: msg });
  }
}
