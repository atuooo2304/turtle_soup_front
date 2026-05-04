import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './_lib/supabase';
import { applyCors, handleOptions } from './_lib/cors';

const SOUP = new Set(['清汤', '红汤', '黑汤']);
const MAX_TITLE = 200;
const MAX_BODY = 12000;

function json(res: VercelResponse, status: number, body: unknown): void {
  applyCors(res);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

/** Vercel Node 下 body 可能是 object / string / Buffer，需统一解析 */
function parseJsonBody(req: VercelRequest): unknown {
  const b = req.body as unknown;
  if (b == null || b === '') return undefined;
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  const s = Buffer.isBuffer(b) ? b.toString('utf8') : typeof b === 'string' ? b : String(b);
  if (!s.trim()) return undefined;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  try {
    const raw = parseJsonBody(req);
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      json(res, 400, { error: '请求体须为 JSON 对象' });
      return;
    }
    const r = raw as Record<string, unknown>;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const surface = typeof r.surface === 'string' ? r.surface.trim() : '';
    const bottom = typeof r.bottom === 'string' ? r.bottom.trim() : '';
    const soupType = typeof r.soupType === 'string' ? r.soupType.trim() : '';
    if (!title || !surface || !bottom) {
      json(res, 400, { error: '标题、汤面、汤底均不能为空' });
      return;
    }
    if (!SOUP.has(soupType)) {
      json(res, 400, { error: '汤底浓度无效' });
      return;
    }
    if (title.length > MAX_TITLE || surface.length > MAX_BODY || bottom.length > MAX_BODY) {
      json(res, 400, { error: '内容过长' });
      return;
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('riddle_submissions')
      .insert({
        title,
        surface,
        bottom,
        soup_type: soupType,
        difficulty: 'medium',
        status: 'pending',
      })
      .select('id, title, surface, bottom, soup_type, status, created_at')
      .single();
    if (error) {
      console.error('[api/submissions]', error);
      json(res, 500, {
        error: '保存失败',
        details: error.message,
        code: error.code,
      });
      return;
    }
    if (!data) {
      json(res, 500, { error: '保存失败', details: '未返回数据行' });
      return;
    }
    json(res, 201, {
      submission: {
        id: data.id as string,
        title: data.title,
        surface: data.surface,
        bottom: data.bottom,
        soupType: data.soup_type,
        status: data.status,
        submittedAt: new Date(data.created_at as string).getTime(),
      },
    });
  } catch (e) {
    if ((e as Error).message?.includes('Missing SUPABASE')) {
      json(res, 503, { error: '服务端未配置 Supabase' });
      return;
    }
    console.error('[api/submissions]', e);
    json(res, 500, { error: '服务器错误' });
  }
}
