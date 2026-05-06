/**
 * 解析 DeepSeek / OpenAI 兼容的 chat completions SSE（data: {...} / [DONE]）。
 */
export async function consumeOpenAIChatStream(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '').trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]' || payload === '') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          const c = json.choices?.[0]?.delta?.content;
          if (typeof c === 'string' && c.length) full += c;
        } catch {
          /* 忽略损坏行 */
        }
      }
    }

    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== '[DONE]') {
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          const c = json.choices?.[0]?.delta?.content;
          if (typeof c === 'string' && c.length) full += c;
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    console.error('[openai stream]', e);
    return '';
  }

  const out = full.trim();
  return out || '不重要';
}
