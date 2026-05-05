import { getSupabaseAdmin } from './supabase.js';
import { verifyAccessToken } from './wechatJwt.js';

/**
 * 从 Bearer token 解析投稿者标识：优先 Supabase Auth JWT，其次微信小程序 access JWT（openid）。
 * 写入 DB 的 `submitter_openid`：`supabase:<uuid>` 或微信 openid 字符串。
 */
export async function resolveSubmitterFromBearer(bearer: string): Promise<string | null> {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.auth.getUser(bearer);
    if (!error && data.user?.id) {
      return `supabase:${data.user.id}`;
    }
  } catch {
    /* 未配置 SUPABASE_* 或非 Supabase JWT */
  }
  const openid = await verifyAccessToken(bearer);
  if (openid) return openid;
  return null;
}
