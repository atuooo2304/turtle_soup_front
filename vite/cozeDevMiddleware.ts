import type { IncomingMessage, ServerResponse } from 'node:http';
import { forwardCozeChat } from '../api/_lib/forwardCozeChat.ts';

/**
 * 本地 `npm run dev` 时模拟 `/api/coze-chat`，从 .env 读 PAT（不注入前端包）。
 */
export function createCozeDevMiddleware(opts: { pat: string; botId: string; base: string }) {
  return async function cozeDevMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const url = req.url ?? '';
    if (!url.startsWith('/api/coze-chat')) {
      next();
      return;
    }
    if (req.method !== 'POST') {
      next();
      return;
    }

    if (!opts.pat || !opts.botId) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: '本地请在 .env.local 配置 COZE_TOKEN、COZE_BOT_ID（仅服务端使用，不会打进前端）',
        }),
      );
      return;
    }

    const chunks: Buffer[] = [];
    try {
      for await (const ch of req as AsyncIterable<Buffer | string | Uint8Array>) {
        chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
      }
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Could not read body' }));
      return;
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const u = new URL(url, 'http://localhost');
    const conversationId = u.searchParams.get('conversation_id') || undefined;

    let upstream: Response;
    try {
      upstream = await forwardCozeChat({
        pat: opts.pat,
        botId: opts.botId,
        base: opts.base,
        conversationId,
        body,
      });
    } catch (e) {
      console.error('[vite coze dev]', e);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Upstream fetch failed' }));
      return;
    }

    if (!upstream.ok) {
      const t = await upstream.text().catch(() => '');
      res.statusCode = upstream.status >= 400 ? upstream.status : 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Upstream error', detail: t.slice(0, 2000) }));
      return;
    }

    if (!upstream.body) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Empty upstream body' }));
      return;
    }

    res.statusCode = upstream.status;
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    const cache = upstream.headers.get('cache-control');
    if (cache) res.setHeader('Cache-Control', cache);

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) res.write(Buffer.from(value));
      }
    } catch (e) {
      console.error('[vite coze dev] stream', e);
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Stream error' }));
        return;
      }
    }
    res.end();
  };
}
