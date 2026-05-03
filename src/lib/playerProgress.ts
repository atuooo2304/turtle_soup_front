/** 本地进度：与微信小游戏 wx.setStorage 共用键名与 JSON 结构，便于迁移 */

export const PROGRESS_STORAGE_KEY = 'turtleSoupProgress_v1';

export interface RiddleProgress {
  played: boolean;
  cleared: boolean;
  updatedAt: number;
}

export type ProgressMap = Record<string, RiddleProgress>;

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
      const v = wx.getStorageSync!(PROGRESS_STORAGE_KEY);
      if (v == null || v === '') return null;
      return typeof v === 'string' ? v : JSON.stringify(v);
    } catch {
      return null;
    }
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(PROGRESS_STORAGE_KEY);
  }
  return null;
}

function writeRaw(json: string) {
  const wx = getWx();
  if (wx) {
    try {
      wx.setStorageSync!(PROGRESS_STORAGE_KEY, json);
    } catch {
      /* ignore */
    }
  } else if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PROGRESS_STORAGE_KEY, json);
  }
  try {
    window.dispatchEvent(new CustomEvent('turtleSoupProgress'));
  } catch {
    /* ignore */
  }
}

let cacheJson: string | null = null;
let cacheMap: ProgressMap | null = null;

export function getProgress(): ProgressMap {
  const raw = readRaw();
  const json = raw ?? '{}';
  if (cacheJson === json && cacheMap) return cacheMap;
  cacheJson = json;
  try {
    const p = JSON.parse(json) as ProgressMap;
    cacheMap = p && typeof p === 'object' ? p : {};
  } catch {
    cacheMap = {};
  }
  return cacheMap!;
}

export function recordGameEnd(opts: { riddleId: string; cleared: boolean }) {
  if (!opts.riddleId) return;
  const map: ProgressMap = { ...getProgress() };
  const prev = map[opts.riddleId] ?? { played: false, cleared: false, updatedAt: 0 };
  map[opts.riddleId] = {
    played: true,
    cleared: prev.cleared || opts.cleared,
    updatedAt: Date.now(),
  };
  cacheJson = null;
  cacheMap = null;
  writeRaw(JSON.stringify(map));
}

export function subscribeProgress(onChange: () => void): () => void {
  const handler = () => onChange();
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handler);
    window.addEventListener('turtleSoupProgress', handler as EventListener);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('turtleSoupProgress', handler as EventListener);
    };
  }
  return () => {};
}
