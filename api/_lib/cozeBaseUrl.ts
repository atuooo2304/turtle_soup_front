/** 与前端旧逻辑一致：优先 COZE_BASE_URL，否则按 COZE_REGION 选国内/国际 API */
export function cozeApiBaseFromEnv(): string {
  const base = process.env.COZE_BASE_URL?.trim();
  if (base) return base.replace(/\/$/, '');
  const region = String(process.env.COZE_REGION || '').toLowerCase();
  if (region === 'cn' || region === 'china') return 'https://api.coze.cn';
  return 'https://api.coze.com';
}
