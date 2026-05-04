/**
 * 生产环境：与 H5 同源，使用相对路径 `/api/...`。
 * 本地开发：在 `.env.local` 设置 `VITE_API_BASE=https://你的部署.vercel.app` 以请求已部署的 Vercel API（或 `vercel dev` 同源）。
 */
export function getApiBase(): string {
  const explicit = import.meta.env.VITE_API_BASE as string | undefined;
  if (explicit && explicit.trim()) return explicit.replace(/\/$/, '');
  if (import.meta.env.PROD) return '';
  return '';
}

/** 开发环境未配置 VITE_API_BASE 时不要请求 /api（Vite dev 无该路由）。生产环境始终可请求同源 /api。 */
export function canUseRemoteApi(): boolean {
  if (import.meta.env.PROD) return true;
  return Boolean(String(import.meta.env.VITE_API_BASE || '').trim());
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}
