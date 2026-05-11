/** 本地聚合：成功通关次数、累计用时与提问轮次（与微信小游戏 wx 存储共用键名） */

export const GAME_STATS_STORAGE_KEY = 'turtleSoupGameStats_v1';

export const GAME_STATS_CHANGED_EVENT = 'turtleSoupGameStats';

export interface GameStatsAggregate {
  clearCount: number;
  sumElapsedMs: number;
  sumAttempts: number;
}

interface WxLike {
  getStorageSync?: (key: string) => unknown;
  setStorageSync?: (key: string, data: unknown) => void;
}

function getWx(): WxLike | undefined {
  try {
    const w = (globalThis as { wx?: WxLike }).wx;
    return w?.getStorageSync && w?.setStorageSync ? w : undefined;
  } catch {
    return undefined;
  }
}

function readRaw(): string | null {
  const wx = getWx();
  if (wx) {
    try {
      const v = wx.getStorageSync!(GAME_STATS_STORAGE_KEY);
      if (v == null || v === '') return null;
      return typeof v === 'string' ? v : JSON.stringify(v);
    } catch {
      return null;
    }
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(GAME_STATS_STORAGE_KEY);
  }
  return null;
}

function writeRaw(json: string) {
  const wx = getWx();
  if (wx) {
    try {
      wx.setStorageSync!(GAME_STATS_STORAGE_KEY, json);
    } catch {
      /* ignore */
    }
  } else if (typeof localStorage !== 'undefined') {
    localStorage.setItem(GAME_STATS_STORAGE_KEY, json);
  }
  try {
    window.dispatchEvent(new CustomEvent(GAME_STATS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

function normalize(raw: unknown): GameStatsAggregate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { clearCount: 0, sumElapsedMs: 0, sumAttempts: 0 };
  }
  const o = raw as Record<string, unknown>;
  const clearCount = typeof o.clearCount === 'number' && Number.isFinite(o.clearCount) && o.clearCount >= 0 ? Math.floor(o.clearCount) : 0;
  const sumElapsedMs =
    typeof o.sumElapsedMs === 'number' && Number.isFinite(o.sumElapsedMs) && o.sumElapsedMs >= 0 ? o.sumElapsedMs : 0;
  const sumAttempts =
    typeof o.sumAttempts === 'number' && Number.isFinite(o.sumAttempts) && o.sumAttempts >= 0 ? o.sumAttempts : 0;
  return { clearCount, sumElapsedMs, sumAttempts };
}

export function getGameStats(): GameStatsAggregate {
  const raw = readRaw();
  if (!raw) return { clearCount: 0, sumElapsedMs: 0, sumAttempts: 0 };
  try {
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return { clearCount: 0, sumElapsedMs: 0, sumAttempts: 0 };
  }
}

/** 记录一次成功通关（本局用时与已用提问次数） */
export function recordClearRun(opts: { elapsedMs: number; attempts: number }) {
  const elapsedMs = Number.isFinite(opts.elapsedMs) && opts.elapsedMs >= 0 ? opts.elapsedMs : 0;
  const attempts = Number.isFinite(opts.attempts) && opts.attempts >= 0 ? Math.floor(opts.attempts) : 0;
  const prev = getGameStats();
  const next: GameStatsAggregate = {
    clearCount: prev.clearCount + 1,
    sumElapsedMs: prev.sumElapsedMs + elapsedMs,
    sumAttempts: prev.sumAttempts + attempts,
  };
  writeRaw(JSON.stringify(next));
}

export function subscribeGameStats(onChange: () => void): () => void {
  const handler = () => onChange();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handler);
    window.addEventListener(GAME_STATS_CHANGED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(GAME_STATS_CHANGED_EVENT, handler as EventListener);
    };
  }
  return () => {};
}
