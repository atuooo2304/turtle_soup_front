import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdmin } from './_lib/supabase.js';
import { dbRowToRiddle, type DbSubmission } from './_lib/riddleMap.js';
import { applyCors, handleOptions } from './_lib/cors.js';

function json(res: VercelResponse, status: number, body: unknown): void {
  applyCors(res);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
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
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('riddle_submissions')
      .select('id, title, surface, bottom, soup_type, difficulty, status, reviewer_note, created_at, reviewed_at')
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[api/riddles-published]', error);
      json(res, 500, { error: '查询失败' });
      return;
    }
    const rows = (data ?? []) as DbSubmission[];
    const riddles = rows.map((row) => dbRowToRiddle(row));
    json(res, 200, riddles);
  } catch (e) {
    if ((e as Error).message?.includes('Missing SUPABASE')) {
      json(res, 200, []);
      return;
    }
    console.error('[api/riddles-published]', e);
    json(res, 500, { error: '服务器错误' });
  }
}
