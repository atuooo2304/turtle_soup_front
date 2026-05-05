/**
 * 扣子（Coze）智能体作为海龟汤主持人。
 * 环境变量与根目录 `.env.example` 对齐：`COZE_TOKEN`、`COZE_BOT_ID`、`COZE_REGION` / `COZE_BASE_URL`、`COZE_USER_ID`。
 * 微信小程序登录后，`getCozeRuntimeUserId()` 优先于环境变量，实现对局按用户隔离。
 * 开发环境通过 Vite 代理 `/coze-api` 转发到当前配置的 API 域名，避免浏览器 CORS。
 * @see https://www.coze.cn/open/docs/developer_guides/chat_v3
 */

import { getCozeRuntimeUserId } from './authSession';

export type CozeConversationState = {
  conversationId?: string;
};

const FALLBACK = '汤主走神了，一会再试。';

function cozeApiBaseFromEnv(): string {
  const base = (import.meta.env.COZE_BASE_URL as string | undefined)?.trim();
  if (base) return base.replace(/\/$/, '');
  const region = String(import.meta.env.COZE_REGION || '').toLowerCase();
  if (region === 'cn' || region === 'china') return 'https://api.coze.cn';
  return 'https://api.coze.com';
}

function apiRoot(): string {
  return import.meta.env.DEV ? '/coze-api' : cozeApiBaseFromEnv();
}

function buildFirstUserContent(surface: string, bottom: string, question: string): string {
  return [
    '【本局海龟汤 — 你担任汤主】',
    `汤面：${surface}`,
    `汤底（你掌握全貌，未揭晓前请勿整段复述给玩家）：${bottom}`,
    '',
    '请严格遵守你在扣子中配置的主持人规则；对是非类问题用「是 / 不是 / 是也不是 / 不重要」作答。',
    '',
    `玩家提问：${question}`,
  ].join('\n');
}

function splitSseFrames(buffer: string): { frames: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  return { frames: parts.filter((p) => p.trim().length > 0), rest };
}

function parseFrame(block: string): { event: string; data: string } | null {
  let event = '';
  let data = '';
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data = line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

/**
 * 向 Coze 主持人提问。会就地更新 `conv.conversationId`（首次对话后写入，用于多轮上下文）。
 */
export async function askHost(
  puzzleSurface: string,
  puzzleBottom: string,
  question: string,
  _history: { role: string; text: string }[],
  conv: CozeConversationState,
): Promise<string> {
  const pat = (import.meta.env.COZE_TOKEN as string | undefined)?.trim();
  const botId = (import.meta.env.COZE_BOT_ID as string | undefined)?.trim();
  const runtimeId = getCozeRuntimeUserId();
  const userId =
    runtimeId?.trim() ||
    (import.meta.env.COZE_USER_ID as string | undefined)?.trim() ||
    'turtle-soup-guest';

  if (!pat || !botId) {
    console.warn('[Coze] 请在 .env.local 中配置 COZE_TOKEN 与 COZE_BOT_ID（参见 .env.example）');
    return FALLBACK;
  }

  const isContinuing = Boolean(conv.conversationId);
  const additional_messages: { role: string; content: string; content_type: string }[] = [];

  if (!isContinuing) {
    additional_messages.push({
      role: 'user',
      content: buildFirstUserContent(puzzleSurface, puzzleBottom, question),
      content_type: 'text',
    });
  } else {
    additional_messages.push({
      role: 'user',
      content: question,
      content_type: 'text',
    });
  }

  const url = `${apiRoot()}/v3/chat${conv.conversationId ? `?conversation_id=${encodeURIComponent(conv.conversationId)}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: userId,
        stream: true,
        auto_save_history: true,
        additional_messages,
      }),
    });
  } catch (e) {
    console.error('[Coze] 网络错误', e);
    return FALLBACK;
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[Coze] HTTP', res.status, t);
    return FALLBACK;
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream') && ct.includes('application/json')) {
    const t = await res.text().catch(() => '');
    console.error('[Coze] 非流式/错误 JSON 响应', t);
    return FALLBACK;
  }

  if (!res.body) {
    return FALLBACK;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let lastCompletedAnswer = '';
  let deltaAnswer = '';
  let sawFail = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const { frames, rest } = splitSseFrames(carry);
      carry = rest;

      for (const frame of frames) {
        const parsed = parseFrame(frame);
        if (!parsed) continue;
        const { event, data } = parsed;
        if (data === '[DONE]') continue;
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (event === 'conversation.chat.created' || event === 'conversation.chat.in_progress') {
          const cid = json.conversation_id as string | undefined;
          if (cid) conv.conversationId = cid;
        }

        if (event === 'conversation.message.delta') {
          const type = json.type as string | undefined;
          if (type === 'answer' && typeof json.content === 'string') {
            deltaAnswer += json.content;
          }
        }

        if (event === 'conversation.message.completed') {
          const type = json.type as string | undefined;
          if (type === 'answer' && typeof json.content === 'string') {
            lastCompletedAnswer = json.content;
            deltaAnswer = '';
          }
        }

        if (event === 'conversation.chat.failed' || event === 'error') {
          sawFail = true;
        }

        if (event === 'conversation.chat.completed') {
          const err = json.last_error as { code?: number } | null | undefined;
          if (err && typeof err.code === 'number' && err.code !== 0) {
            sawFail = true;
          }
        }
      }
    }
  } catch (e) {
    console.error('[Coze] 流读取失败', e);
    return FALLBACK;
  }

  if (sawFail) return FALLBACK;

  const out = (lastCompletedAnswer || deltaAnswer).trim();
  return out || '不重要';
}
