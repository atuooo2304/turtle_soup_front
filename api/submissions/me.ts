import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseBearerHeader } from '../_lib/authHeader.js';
import { getSupabaseAdmin } from '../_lib/supabase.js';
import { applyCors, handleOptions } from '../_lib/cors.js';
import { resolveSubmitterFromBearer } from '../_lib/resolveSubmitter.js';

function json(res: VercelResponse, status: number, body: unknown): void {
  applyCors(res);
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

type DbRow = {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  tag: string;
  difficulty: string;
  status: string;
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function rowToClient(row: DbRow) {
  const st = row.status === 'approved' || row.status === 'rejected' || row.status === 'pending' ? row.status : 'pending';
  let reviewedAt: number | null = null;
  if (typeof row.reviewed_at === 'string' && row.reviewed_at) {
    const t = Date.parse(row.reviewed_at);
    if (Number.isFinite(t) && t > 0) reviewedAt = t;
  }
  return {
    id: row.id,
    title: row.title,
    surface: row.surface,
    bottom: row.bottom,
    tag: (row.tag ?? '轻松').trim() || '轻松',
    difficulty: (row.difficulty ?? 'medium').toLowerCase(),
    status: st,
    submittedAt: new Date(row.created_at).getTime(),
    reviewerNote: row.reviewer_note && row.reviewer_note.trim() ? row.reviewer_note.trim() : null,
    reviewedAt,
  };
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
    const bearer = parseBearerHeader(req.headers.authorization);
    if (!bearer) {
      json(res, 401, {
        error: '需要登录',
        hint: '请使用邮箱 Magic Link 登录（网页）或从小程序打开后再查看投稿',
      });
      return;
    }
    const submitterOpenid = await resolveSubmitterFromBearer(bearer);
    if (!submitterOpenid) {
      json(res, 401, { error: '登录已失效', hint: '请重新登录' });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('riddle_submissions')
      .select('id, title, surface, bottom, tag, difficulty, status, reviewer_note, created_at, reviewed_at')
      .eq('submitter_openid', submitterOpenid)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[api/submissions/me]', error);
      json(res, 500, { error: '查询失败' });
      return;
    }
    const rows = (data ?? []) as DbRow[];
    const submissions = rows.map(rowToClient);
    json(res, 200, { submissions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Missing SUPABASE')) {
      json(res, 503, { error: '服务端未配置 Supabase' });
      return;
    }
    console.error('[api/submissions/me]', e);
    json(res, 500, { error: '服务器错误', details: msg });
  }
}
