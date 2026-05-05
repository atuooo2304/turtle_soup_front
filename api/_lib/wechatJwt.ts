import * as jose from 'jose';
import { createHmac } from 'node:crypto';

const TICKET_USE = 'wx_ticket';
const ACCESS_USE = 'wx_access';

function jwtSecretKey(): Uint8Array | null {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

/** 同时配置了 JWT、小程序 appId/secret 时启用微信登录链路。 */
export function isWeChatAuthConfigured(): boolean {
  return Boolean(
    jwtSecretKey() && process.env.WECHAT_MINI_APPID?.trim() && process.env.WECHAT_MINI_SECRET?.trim(),
  );
}

export async function signTicketToken(openid: string): Promise<string | null> {
  const key = jwtSecretKey();
  if (!key) return null;
  return new jose.SignJWT({ token_use: TICKET_USE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(openid)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

export async function signAccessToken(openid: string): Promise<string | null> {
  const key = jwtSecretKey();
  if (!key) return null;
  return new jose.SignJWT({ token_use: ACCESS_USE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(openid)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifyTicketToken(jwt: string): Promise<string | null> {
  const key = jwtSecretKey();
  if (!key) return null;
  try {
    const { payload } = await jose.jwtVerify(jwt, key);
    if (payload.token_use !== TICKET_USE) return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function verifyAccessToken(jwt: string): Promise<string | null> {
  const key = jwtSecretKey();
  if (!key) return null;
  try {
    const { payload } = await jose.jwtVerify(jwt, key);
    if (payload.token_use !== ACCESS_USE) return null;
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** 供 Coze `user_id`：稳定、不可逆（依赖 JWT_SECRET）。 */
export function cozeUserIdFromOpenid(openid: string): string {
  const s = process.env.JWT_SECRET?.trim() || '';
  return createHmac('sha256', s).update(`coze:${openid}`).digest('hex').slice(0, 32);
}
