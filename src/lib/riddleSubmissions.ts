import { apiUrl, canUseRemoteApi } from './apiBase';
import { authHeadersAsync } from './authSession';

const STORAGE_KEY = 'turtle-soup-riddle-submissions';

export const SUBMISSION_TAGS = ['轻松', '恐怖', '悬疑', '搞笑'] as const;
export type SubmissionTag = (typeof SUBMISSION_TAGS)[number];

export const SUBMISSION_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type SubmissionDifficulty = (typeof SUBMISSION_DIFFICULTIES)[number];

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface RiddleSubmission {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  tag: SubmissionTag;
  difficulty: SubmissionDifficulty;
  status: SubmissionStatus;
  submittedAt: number;
  /** 审核备注（服务端同步后可能有） */
  reviewerNote?: string | null;
  /** 审核时间戳 ms（服务端同步后可能有） */
  reviewedAt?: number;
}

function isSubmissionTag(x: unknown): x is SubmissionTag {
  return typeof x === 'string' && (SUBMISSION_TAGS as readonly string[]).includes(x);
}

function isSubmissionDifficulty(x: unknown): x is SubmissionDifficulty {
  return typeof x === 'string' && (SUBMISSION_DIFFICULTIES as readonly string[]).includes(x.trim().toLowerCase());
}

/** 旧版 localStorage 仅有 soupType（清汤/红汤/黑汤）时映射为 tag */
function tagFromLegacySoupType(soupType: unknown): SubmissionTag | null {
  if (soupType === '清汤') return '轻松';
  if (soupType === '红汤') return '恐怖';
  if (soupType === '黑汤') return '悬疑';
  return null;
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

  let tag: SubmissionTag | null = isSubmissionTag(x.tag) ? x.tag : null;
  if (!tag) tag = tagFromLegacySoupType(x.soupType);
  if (!tag) return null;

  let difficulty: SubmissionDifficulty = 'medium';
  const dRaw = typeof x.difficulty === 'string' ? x.difficulty.trim().toLowerCase() : '';
  if (isSubmissionDifficulty(dRaw)) difficulty = dRaw as SubmissionDifficulty;

  const submittedAt = typeof x.submittedAt === 'number' && Number.isFinite(x.submittedAt) ? x.submittedAt : 0;
  const out: RiddleSubmission = {
    id,
    title,
    surface,
    bottom,
    tag,
    difficulty,
    status: normalizeStatus(x.status),
    submittedAt,
  };
  if (typeof x.reviewerNote === 'string' && x.reviewerNote.trim()) {
    out.reviewerNote = x.reviewerNote.trim();
  } else if (x.reviewerNote === null) {
    out.reviewerNote = null;
  }
  if (typeof x.reviewedAt === 'number' && Number.isFinite(x.reviewedAt) && x.reviewedAt > 0) {
    out.reviewedAt = x.reviewedAt;
  }
  return out;
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
  tag: SubmissionTag;
  difficulty: SubmissionDifficulty;
};

function writeLocalEntry(item: RiddleSubmission): void {
  if (typeof localStorage === 'undefined') return;
  const next = [item, ...readRaw().filter((r) => r.id !== item.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function writeMergedSubmissions(merged: RiddleSubmission[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

/**
 * 从服务端拉取当前登录用户的投稿，与 localStorage 按 id 合并（服务端为准），失败不清空本地。
 */
export async function syncSubmissionsFromServer(): Promise<boolean> {
  if (!canUseRemoteApi()) return false;
  try {
    const auth = await authHeadersAsync();
    const res = await fetch(apiUrl('/api/submissions/me'), {
      method: 'GET',
      headers: { ...auth },
    });
    const data = (await res.json()) as { submissions?: unknown; error?: string };
    if (!res.ok || !Array.isArray(data.submissions)) {
      return false;
    }
    const serverItems: RiddleSubmission[] = [];
    for (const row of data.submissions) {
      const item = parseItem(row);
      if (item) serverItems.push(item);
    }
    const local = readRaw();
    const byId = new Map<string, RiddleSubmission>();
    for (const item of local) byId.set(item.id, item);
    for (const item of serverItems) byId.set(item.id, item);
    const merged = [...byId.values()].sort((a, b) => b.submittedAt - a.submittedAt);
    writeMergedSubmissions(merged);
    return true;
  } catch {
    return false;
  }
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
  if (!isSubmissionTag(input.tag)) {
    return { ok: false, error: '请选择标签' };
  }
  if (!isSubmissionDifficulty(input.difficulty)) {
    return { ok: false, error: '请选择难度' };
  }
  const base = apiUrl('/api/submissions');
  if (!canUseRemoteApi()) {
    return {
      ok: false,
      error: '本地开发请在 .env.local 设置 VITE_API_BASE 为已部署站点根 URL，或运行 vercel dev 联调。',
    };
  }
  try {
    const auth = await authHeadersAsync();
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...auth,
      },
      body: JSON.stringify({
        title,
        surface,
        bottom,
        tag: input.tag,
        difficulty: input.difficulty,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      details?: string;
      hint?: string;
      code?: string;
      submission?: Record<string, unknown>;
    };
    if (!res.ok) {
      const baseErr = data.error || `提交失败（${res.status}）`;
      const extra = data.details || data.hint;
      const hint = extra ? `${baseErr}：${extra}` : baseErr;
      return { ok: false, error: hint };
    }
    const s = data.submission;
    if (!s || typeof s.id !== 'string') {
      return { ok: false, error: '响应格式异常' };
    }
    const st = s.status === 'approved' || s.status === 'rejected' || s.status === 'pending' ? s.status : 'pending';
    const tag: SubmissionTag = isSubmissionTag(s.tag) ? s.tag : input.tag;
    const difficulty: SubmissionDifficulty = isSubmissionDifficulty(s.difficulty)
      ? (s.difficulty as string).trim().toLowerCase() as SubmissionDifficulty
      : input.difficulty;
    const item: RiddleSubmission = {
      id: s.id,
      title: typeof s.title === 'string' ? s.title : title,
      surface: typeof s.surface === 'string' ? s.surface : surface,
      bottom: typeof s.bottom === 'string' ? s.bottom : bottom,
      tag,
      difficulty,
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
