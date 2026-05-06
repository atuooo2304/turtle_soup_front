import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchDeepseekChatUpstream } from './_lib/deepseekUpstream.js';
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

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    json(res, 503, { error: 'DeepSeek proxy not configured (DEEPSEEK_API_KEY)' });
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

  const surface = typeof body.surface === 'string' ? body.surface : '';
  const bottom = typeof body.bottom === 'string' ? body.bottom : '';
  const question = typeof body.question === 'string' ? body.question : '';
  if (!surface || !bottom || !question.trim()) {
    json(res, 400, { error: 'surface, bottom, question are required' });
    return;
  }

  const histRaw = body.history;
  const history: { role: string; text: string }[] = [];
  if (Array.isArray(histRaw)) {
    for (const item of histRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const r = item as Record<string, unknown>;
      const role = typeof r.role === 'string' ? r.role : '';
      const text = typeof r.text === 'string' ? r.text : '';
      if (!role || !text) continue;
      history.push({ role, text });
    }
  }

  let upstream: Response;
  try {
    upstream = await fetchDeepseekChatUpstream({
      apiKey,
      surface,
      bottom,
      question,
      history,
    });
  } catch (e) {
    console.error('[deepseek-chat] upstream fetch', e);
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
    console.error('[deepseek-chat] stream pipe', e);
    if (!res.headersSent) {
      json(res, 502, { error: 'Stream error' });
      return;
    }
  }
  res.end();
}
