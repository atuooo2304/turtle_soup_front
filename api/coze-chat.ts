import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cozeApiBaseFromEnv } from './_lib/cozeBaseUrl.js';
import { forwardCozeChat } from './_lib/forwardCozeChat.js';
import { parseJsonBody } from './_lib/parseJsonBody.js';

const MAX_BODY_CHARS = 512_000;

function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const pat = process.env.COZE_TOKEN?.trim();
  const botId = process.env.COZE_BOT_ID?.trim();
  if (!pat || !botId) {
    json(res, 503, { error: 'Coze proxy is not configured (COZE_TOKEN / COZE_BOT_ID)' });
    return;
  }

  const raw = parseJsonBody(req);
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    json(res, 400, { error: 'Request body must be a JSON object' });
    return;
  }
  const body = raw as Record<string, unknown>;

  const str = JSON.stringify(body);
  if (str.length > MAX_BODY_CHARS) {
    json(res, 413, { error: 'Body too large' });
    return;
  }

  const q = req.query;
  const cidRaw = q.conversation_id;
  const conversationId =
    typeof cidRaw === 'string'
      ? cidRaw
      : Array.isArray(cidRaw) && typeof cidRaw[0] === 'string'
        ? cidRaw[0]
        : undefined;

  let upstream: Response;
  try {
    upstream = await forwardCozeChat({
      pat,
      botId,
      base: cozeApiBaseFromEnv(),
      conversationId,
      body,
    });
  } catch (e) {
    console.error('[coze-chat] upstream fetch', e);
    json(res, 502, { error: 'Upstream fetch failed' });
    return;
  }

  const ct = upstream.headers.get('content-type') || '';

  if (!upstream.ok) {
    const t = await upstream.text().catch(() => '');
    json(res, upstream.status >= 400 ? upstream.status : 502, {
      error: 'Upstream returned error',
      detail: t.slice(0, 2000),
    });
    return;
  }

  if (!upstream.body) {
    json(res, 502, { error: 'Empty upstream body' });
    return;
  }

  res.status(upstream.status);
  if (ct) res.setHeader('Content-Type', ct);
  const cache = upstream.headers.get('cache-control');
  if (cache) res.setHeader('Cache-Control', cache);

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        res.write(Buffer.from(value));
      }
    }
  } catch (e) {
    console.error('[coze-chat] stream pipe', e);
    if (!res.headersSent) {
      json(res, 502, { error: 'Stream error' });
      return;
    }
  }
  res.end();
}
