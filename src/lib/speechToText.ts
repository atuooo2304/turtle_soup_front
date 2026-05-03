/**
 * Web 端语音识别（SpeechRecognition）。微信小游戏需替换为插件/BFF ASR 等实现。
 */

type SpeechRecCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
  const g = globalThis as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

export function isSpeechToTextSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

let active: SpeechRecognition | null = null;

export function stopSpeechToText() {
  if (active) {
    try {
      active.stop();
    } catch {
      /* ignore */
    }
    active.onresult = null;
    active.onerror = null;
    active.onend = null;
    active = null;
  }
}

export function startSpeechToText(opts: {
  onResult: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}) {
  stopSpeechToText();
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    opts.onError?.('当前环境不支持语音识别');
    return;
  }
  const rec = new Ctor();
  rec.lang = 'zh-CN';
  rec.continuous = false;
  rec.interimResults = true;

  rec.onresult = (event: SpeechRecognitionEvent) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i]!;
      const t = r[0]?.transcript ?? '';
      if (r.isFinal) final += t;
      else interim += t;
    }
    const text = (final || interim).trim();
    if (text) opts.onResult(text, !!final && !interim);
  };

  rec.onerror = (e: SpeechRecognitionErrorEvent) => {
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    opts.onError?.(e.message || e.error || '语音识别出错');
  };

  rec.onend = () => {
    active = null;
    opts.onEnd?.();
  };

  try {
    active = rec;
    rec.start();
  } catch (e) {
    active = null;
    opts.onError?.(e instanceof Error ? e.message : '无法启动语音识别');
  }
}
