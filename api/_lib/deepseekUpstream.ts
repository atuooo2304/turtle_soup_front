import {
  applyDeepseekSystemTemplate,
  buildDeepseekChatMessages,
  DEFAULT_DEEPSEEK_SYSTEM_PROMPT_TEMPLATE,
} from './buildDeepseekMessages.js';

export function deepseekApiBaseFromEnv(): string {
  const u = process.env.DEEPSEEK_API_URL?.trim();
  if (u) return u.replace(/\/$/, '');
  return 'https://api.deepseek.com';
}

export async function fetchDeepseekChatUpstream(params: {
  apiKey: string;
  surface: string;
  bottom: string;
  question: string;
  history: { role: string; text: string }[];
  /** 本地 Vite 等未注入 process.env 时可显式传入 API 根，如 https://api.deepseek.com */
  apiBaseOverride?: string;
}): Promise<Response> {
  const rawTemplate =
    process.env.DEEPSEEK_SYSTEM_PROMPT?.trim() || DEFAULT_DEEPSEEK_SYSTEM_PROMPT_TEMPLATE;
  const systemPromptFilled = applyDeepseekSystemTemplate(
    rawTemplate,
    params.surface,
    params.bottom,
  );
  const model = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
  const messages = buildDeepseekChatMessages(
    params.question,
    params.history,
    systemPromptFilled,
  );

  const base =
    params.apiBaseOverride?.trim().replace(/\/$/, '') || deepseekApiBaseFromEnv();
  const url = `${base}/chat/completions`;

  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });
}
