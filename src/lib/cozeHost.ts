/**
 * 海龟汤主持人：默认 **扣子 Coze**，可通过 `VITE_HOST_PROVIDER=deepseek` 切换为 DeepSeek Chat API。
 * 密钥均在服务端（`/api/coze-chat`、`/api/deepseek-chat`）；浏览器不携带 PAT/API Key。
 * 微信小程序登录后，`getCozeRuntimeUserId()` 优先（Coze user_id；DeepSeek 路径下仍可用于日志侧区分）。
 */

import { getCozeRuntimeUserId } from './authSession';
import { consumeOpenAIChatStream } from './openaiChatStream';

export type CozeConversationState = {
  conversationId?: string;
};

const FALLBACK = '汤主走神了，一会再试。';

function hostProvider(): 'coze' | 'deepseek' {
  const p = (import.meta.env.VITE_HOST_PROVIDER || 'coze').trim().toLowerCase();
  return p === 'deepseek' ? 'deepseek' : 'coze';
}

function cozeChatProxyPath(): string {
  return '/api/coze-chat';
}

function deepseekChatProxyPath(): string {
  return '/api/deepseek-chat';
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

async function askCozeHost(
  puzzleSurface: string,
  puzzleBottom: string,
  question: string,
  conv: CozeConversationState,
): Promise<string> {
  const runtimeId = getCozeRuntimeUserId();
  const userId =
    runtimeId?.trim() ||
    (import.meta.env.VITE_COZE_USER_ID as string | undefined)?.trim() ||
    'turtle-soup-guest';

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

  const url = `${cozeChatProxyPath()}${conv.conversationId ? `?conversation_id=${encodeURIComponent(conv.conversationId)}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: '',
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

async function askDeepseekHost(
  puzzleSurface: string,
  puzzleBottom: string,
  question: string,
  history: { role: string; text: string }[],
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(deepseekChatProxyPath(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        surface: puzzleSurface,
        bottom: puzzleBottom,
        question,
        history,
      }),
    });
  } catch (e) {
    console.error('[DeepSeek] 网络错误', e);
    return FALLBACK;
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[DeepSeek] HTTP', res.status, t);
    return FALLBACK;
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/event-stream')) {
    const t = await res.text().catch(() => '');
    console.error('[DeepSeek] 非 SSE', t.slice(0, 500));
    return FALLBACK;
  }

  const text = await consumeOpenAIChatStream(res.body);
  return text || '不重要';
}

/**
 * 向主持人提问。`conv` 仅在 Coze 模式下用于 `conversation_id`；DeepSeek 模式用 `history` 维护多轮。
 */
export async function askHost(
  puzzleSurface: string,
  puzzleBottom: string,
  question: string,
  history: { role: string; text: string }[],
  conv: CozeConversationState,
): Promise<string> {
  if (hostProvider() === 'deepseek') {
    return askDeepseekHost(puzzleSurface, puzzleBottom, question, history);
  }
  return askCozeHost(puzzleSurface, puzzleBottom, question, conv);
}
