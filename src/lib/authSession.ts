import { apiUrl } from './apiBase';
import { getSupabaseBrowser, isSupabaseBrowserConfigured } from './supabaseBrowser';

/** 小程序 `/api/auth/exchange` 下发的 access JWT */
const WECHAT_ACCESS_KEY = 'turtle-soup-wechat-access-token';

/** Coze `user_id`：微信登录由 exchange 写入；Web 由 Supabase `user.id` 写入 */
const COZE_USER_KEY = 'turtle-soup-coze-user-id';

function cleanTicketFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('ticket')) return;
  url.searchParams.delete('ticket');
  const next = url.pathname + (url.search ? url.search : '') + url.hash;
  window.history.replaceState({}, '', next);
}

/**
 * WebView 启动时 URL 可能带 `?ticket=`（小程序 wx.login 换得的一次性 JWT）。
 * 换取 accessToken 后写入 sessionStorage，并从地址栏移除 ticket。
 */
export async function exchangeTicketFromUrl(): Promise<void> {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const ticket = params.get('ticket');
  if (!ticket?.trim()) return;

  try {
    const res = await fetch(apiUrl('/api/auth/exchange'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: ticket.trim() }),
    });
    const data = (await res.json()) as {
      accessToken?: string;
      cozeUserId?: string;
      error?: string;
    };
    if (!res.ok) {
      console.warn('[auth]', data.error || res.status);
      sessionStorage.removeItem(WECHAT_ACCESS_KEY);
      sessionStorage.removeItem(COZE_USER_KEY);
      cleanTicketFromUrl();
      return;
    }
    if (typeof data.accessToken === 'string') {
      sessionStorage.setItem(WECHAT_ACCESS_KEY, data.accessToken);
    }
    if (typeof data.cozeUserId === 'string') {
      sessionStorage.setItem(COZE_USER_KEY, data.cozeUserId);
    }
    cleanTicketFromUrl();
  } catch (e) {
    console.warn('[auth] exchange failed', e);
    cleanTicketFromUrl();
  }
}

/** 微信小程序 access JWT（仅小程序链路）。 */
export function getWechatAccessToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(WECHAT_ACCESS_KEY);
}

/**
 * 投稿等接口：优先 Supabase session，其次微信 access JWT。
 */
export async function authHeadersAsync(): Promise<Record<string, string>> {
  if (isSupabaseBrowserConfigured()) {
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch {
      /* 未配置或异常 */
    }
  }
  const wx = getWechatAccessToken();
  if (wx) return { Authorization: `Bearer ${wx}` };
  return {};
}

/** Coze `user_id`：优先 sessionStorage；Supabase 登录后由 App 内监听写入 */
export function getCozeRuntimeUserId(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(COZE_USER_KEY);
}

/** 同步 Supabase 用户的 Coze id（与 user.id 一致即可） */
export function setCozeRuntimeUserIdFromSupabase(userId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(COZE_USER_KEY, userId);
}

export function clearCozeRuntimeUserId(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(COZE_USER_KEY);
}

export async function clearAuthSession(): Promise<void> {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(WECHAT_ACCESS_KEY);
    sessionStorage.removeItem(COZE_USER_KEY);
  }
  if (isSupabaseBrowserConfigured()) {
    try {
      await getSupabaseBrowser().auth.signOut();
    } catch {
      /* noop */
    }
  }
}
