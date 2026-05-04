import type { VercelRequest } from '@vercel/node';
import { Buffer } from 'node:buffer';

/**
 * Vercel Node 下 body 可能是 object / string / Buffer。
 * 使用 `node:buffer` 避免个别运行时下无全局 `Buffer` 导致 ReferenceError（进而 FUNCTION_INVOCATION_FAILED）。
 */
export function parseJsonBody(req: VercelRequest): unknown {
  const b = req.body as unknown;
  if (b == null || b === '') return undefined;
  if (typeof b === 'string') {
    const t = b.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return undefined;
    }
  }
  if (Buffer.isBuffer(b)) {
    const t = b.toString('utf8').trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return undefined;
    }
  }
  if (typeof b === 'object' && !Array.isArray(b)) {
    return b;
  }
  return undefined;
}
