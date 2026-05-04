const STORAGE_KEY = 'turtle-soup-riddle-submissions';

export type SoupType = '清汤' | '红汤' | '黑汤';

export interface RiddleSubmission {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  soupType: SoupType;
  status: '待审核';
  submittedAt: number;
}

const SOUP_TYPES: readonly SoupType[] = ['清汤', '红汤', '黑汤'];

function isSoupType(x: unknown): x is SoupType {
  return typeof x === 'string' && (SOUP_TYPES as readonly string[]).includes(x);
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
    status: '待审核',
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

export type AddSubmissionInput = {
  title: string;
  surface: string;
  bottom: string;
  soupType: SoupType;
};

export function addSubmission(input: AddSubmissionInput): { ok: true } | { ok: false; error: string } {
  if (typeof localStorage === 'undefined') {
    return { ok: false, error: '当前环境无法保存（无 localStorage）' };
  }
  const title = input.title.trim();
  const surface = input.surface.trim();
  const bottom = input.bottom.trim();
  if (!title || !surface || !bottom) {
    return { ok: false, error: '标题、汤面、汤底均不能为空' };
  }
  if (!isSoupType(input.soupType)) {
    return { ok: false, error: '请选择汤底浓度' };
  }
  const item: RiddleSubmission = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    surface,
    bottom,
    soupType: input.soupType,
    status: '待审核',
    submittedAt: Date.now(),
  };
  try {
    const next = [item, ...readRaw()];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { ok: true };
  } catch {
    return { ok: false, error: '保存失败（存储可能已满或被禁用）' };
  }
}
