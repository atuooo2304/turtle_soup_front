/**
 * 服务端向 Coze /v3/chat 发起请求（注入 PAT 与 bot_id）。
 * 供 Vercel API 与 Vite 开发中间件共用。
 */
export async function forwardCozeChat(params: {
  pat: string;
  botId: string;
  base: string;
  conversationId?: string;
  body: Record<string, unknown>;
}): Promise<Response> {
  const merged: Record<string, unknown> = { ...params.body, bot_id: params.botId };
  const q = params.conversationId
    ? `?conversation_id=${encodeURIComponent(params.conversationId)}`
    : '';
  const url = `${params.base.replace(/\/$/, '')}/v3/chat${q}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(merged),
  });
}
