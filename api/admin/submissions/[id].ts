import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../../_lib/supabase';
import { applyCors, handleOptions } from '../../_lib/cors';
import { parseJsonBody } from '../../_lib/parseJsonBody';

function json(res: VercelResponse, status: number, body: unknown): void {
  applyCors(res);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

function assertAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const secret = process.env.ADMIN_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    json(res, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    handleOptions(res);
    return;
  }
  if (req.method !== 'PATCH') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!assertAdmin(req, res)) return;
  const id = typeof req.query.id === 'string' ? req.query.id : Array.isArray(req.query.id) ? req.query.id[0] : '';
  if (!id) {
    json(res, 400, { error: 'Missing id' });
    return;
  }
  try {
    const raw = parseJsonBody(req);
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      json(res, 400, { error: '请求体须为 JSON 对象' });
      return;
    }
    const body = raw as Record<string, unknown>;
    const status = body.status === 'approved' || body.status === 'rejected' ? body.status : null;
    if (!status) {
      json(res, 400, { error: 'status 须为 approved 或 rejected' });
      return;
    }
    const reviewer_note =
      typeof body.reviewer_note === 'string' ? body.reviewer_note.slice(0, 2000) : null;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('riddle_submissions')
      .update({
        status,
        reviewer_note,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, title, surface, bottom, soup_type, difficulty, status, reviewer_note, created_at, reviewed_at')
      .single();
    if (error) {
      console.error('[api/admin/submissions/[id]]', error);
      json(res, 500, { error: '更新失败' });
      return;
    }
    if (!data) {
      json(res, 404, { error: '未找到' });
      return;
    }
    json(res, 200, { item: data });
  } catch (e) {
    console.error('[api/admin/submissions/[id]]', e);
    json(res, 500, { error: '服务器错误' });
  }
}
