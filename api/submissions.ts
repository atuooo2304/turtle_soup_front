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
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
    const surface = typeof raw?.surface === 'string' ? raw.surface.trim() : '';
    const bottom = typeof raw?.bottom === 'string' ? raw.bottom.trim() : '';
    const soupType = typeof raw?.soupType === 'string' ? raw.soupType.trim() : '';
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
      json(res, 500, { error: '保存失败' });
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
