import Papa from 'papaparse';
import riddlesCsvRaw from './riddles.csv?raw';

export interface Riddle {
  id: string;
  title: string;
  surface: string;
  bottom: string;
  difficulty: string;
  type: string;
}

function normalizeRow(row: Record<string, string>): Riddle | null {
  const id = (row.id ?? '').trim();
  const title = (row.title ?? '').trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    surface: (row.surface ?? '').trim(),
    bottom: (row.bottom ?? '').trim(),
    difficulty: (row.difficulty ?? '').trim().toLowerCase(),
    type: (row.type ?? '').trim(),
  };
}

function loadRiddles(): Riddle[] {
  const parsed = Papa.parse<Record<string, string>>(riddlesCsvRaw, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length) {
    console.warn('riddles.csv parse warnings', parsed.errors);
  }
  const out: Riddle[] = [];
  for (const row of parsed.data) {
    const r = normalizeRow(row);
    if (r) out.push(r);
  }
  return out;
}

export const riddles = loadRiddles();

/** 合并静态 CSV 与已审核发布的谜题（按 id 去重，优先保留 CSV 顺序前的项） */
export function mergeRiddlePools(staticRiddles: Riddle[], extra: Riddle[]): Riddle[] {
  const seen = new Set(staticRiddles.map((r) => r.id));
  const out = [...staticRiddles];
  for (const r of extra) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export function pickRandomRiddleFromPool(pool: Riddle[], excludeId?: string): Riddle {
  const filtered = excludeId ? pool.filter((r) => r.id !== excludeId) : [...pool];
  if (filtered.length === 0) return pool[0]!;
  return filtered[Math.floor(Math.random() * filtered.length)]!;
}

export function pickRandomRiddle(excludeId?: string): Riddle {
  return pickRandomRiddleFromPool(riddles, excludeId);
}

/** CSV: easy / medium / hard → 列表与对局顶栏展示 */
export function formatDifficultyLabel(d: string): string {
  const key = d.trim().toLowerCase();
  const map: Record<string, string> = {
    easy: '简单',
    medium: '中等',
    hard: '困难',
  };
  return map[key] ?? d;
}

export function riddleSummary(surface: string, maxLen = 80): string {
  const t = surface.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}
