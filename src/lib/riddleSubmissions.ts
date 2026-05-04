import { apiUrl, canUseRemoteApi } from './apiBase';

const STORAGE_KEY = 'turtle-soup-riddle-submissions';

export type SoupType = '清汤' | '红汤' | '黑汤';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface RiddleSubmission {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  soupType: SoupType;
  status: SubmissionStatus;
  submittedAt: number;
}

const SOUP_TYPES: readonly SoupType[] = ['清汤', '红汤', '黑汤'];

function isSoupType(x: unknown): x is SoupType {
  return typeof x === 'string' && (SOUP_TYPES as readonly string[]).includes(x);
}

function normalizeStatus(x: unknown): SubmissionStatus {
  if (x === 'pending' || x === 'approved' || x === 'rejected') return x;
  if (x === '待审核') return 'pending';
  return 'pending';
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseItem(x: unknown): RiddleSubmission | null {
  if (!isRecord(x)) return null;
  const id = typeof x.id === 'string' ? x.id.trim() : '';
  const title = typeof x.title === 'string' ? x.title.trim() : '';
  const surface = typeof x.surface === 'string' ? x.surface.trim() : '';
  const bottom = typeof x.bottom === 'string' ? x.bottom.trim() : '';
  if (!id || !title || !surface || !bottom) return null;
  if (!isSoupType(x.soupType)) return null;
  const submittedAt = typeof x.submittedAt === 'number' && Number.isFinite(x.submittedAt) ? x.submittedAt : 0;
  return {
    id,
    title,
    surface,
    bottom,
    soupType: x.soupType,
    status: normalizeStatus(x.status),
    submittedAt,
  };
}

function readRaw(): RiddleSubmission[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: RiddleSubmission[] = [];
    for (const row of data) {
      const item = parseItem(row);
      if (item) out.push(item);
    }
    return out;
  } catch {
    return [];
  }
}

/** 按提交时间倒序（最新在前） */
export function listSubmissions(): RiddleSubmission[] {
  return readRaw().sort((a, b) => b.submittedAt - a.submittedAt);
}

export function submissionStatusLabel(status: SubmissionStatus): string {
  const m: Record<SubmissionStatus, string> = {
    pending: '待审核',
    approved: '已发布',
    rejected: '未通过',
  };
  return m[status];
}

export type AddSubmissionInput = {
  title: string;
  surface: string;
  bottom: string;
  soupType: SoupType;
};

function writeLocalEntry(item: RiddleSubmission): void {
  if (typeof localStorage === 'undefined') return;
  const next = [item, ...readRaw().filter((r) => r.id !== item.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * 提交到 Vercel API（Supabase）；成功后在 localStorage 保留一份便于「投稿记录」展示。
 */
export async function addSubmission(
  input: AddSubmissionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const title = input.title.trim();
  const surface = input.surface.trim();
  const bottom = input.bottom.trim();
  if (!title || !surface || !bottom) {
    return { ok: false, error: '标题、汤面、汤底均不能为空' };
  }
  if (!isSoupType(input.soupType)) {
    return { ok: false, error: '请选择汤底浓度' };
  }
  const base = apiUrl('/api/submissions');
  if (!canUseRemoteApi()) {
    return {
      ok: false,
      error: '本地开发请在 .env.local 设置 VITE_API_BASE 为已部署站点根 URL，或运行 vercel dev 联调。',
    };
  }
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        surface,
        bottom,
        soupType: input.soupType,
      }),
    });
    const data = (await res.json()) as { error?: string; submission?: Record<string, unknown> };
    if (!res.ok) {
      return { ok: false, error: data.error || `提交失败（${res.status}）` };
    }
    const s = data.submission;
    if (!s || typeof s.id !== 'string') {
      return { ok: false, error: '响应格式异常' };
    }
    const st = s.status === 'approved' || s.status === 'rejected' || s.status === 'pending' ? s.status : 'pending';
    const item: RiddleSubmission = {
      id: s.id,
      title: typeof s.title === 'string' ? s.title : title,
      surface: typeof s.surface === 'string' ? s.surface : surface,
      bottom: typeof s.bottom === 'string' ? s.bottom : bottom,
      soupType: isSoupType(s.soupType) ? s.soupType : input.soupType,
      status: st,
      submittedAt:
        typeof s.submittedAt === 'number'
          ? s.submittedAt
          : typeof s.submittedAt === 'string'
            ? Date.parse(s.submittedAt)
            : Date.now(),
    };
    writeLocalEntry(item);
    return { ok: true };
  } catch {
    return { ok: false, error: '网络错误，请稍后重试' };
  }
}
