/**
 * 解析 `Authorization: Bearer <token>`。
 */
export function parseBearerHeader(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return null;
  const t = m[1]?.trim();
  return t || null;
}
