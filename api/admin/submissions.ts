import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from '../_lib/supabase.js';
import { applyCors, handleOptions } from '../_lib/cors.js';
import type { DbSubmission } from '../_lib/riddleMap.js';

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
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!assertAdmin(req, res)) return;
  try {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from('riddle_submissions')
      .select('id, title, surface, bottom, soup_type, difficulty, status, reviewer_note, created_at, reviewed_at')
      .order('created_at', { ascending: false });
    if (statusFilter === 'all') {
      /* no filter */
    } else {
      q = q.eq('status', statusFilter);
    }
    const { data, error } = await q;
    if (error) {
      console.error('[api/admin/submissions]', error);
      json(res, 500, { error: '查询失败' });
      return;
    }
    json(res, 200, { items: (data ?? []) as DbSubmission[] });
  } catch (e) {
    console.error('[api/admin/submissions]', e);
    json(res, 500, { error: '服务器错误' });
  }
}
