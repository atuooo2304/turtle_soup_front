import { useState } from 'react';
import { X } from 'lucide-react';
import { getSupabaseBrowser, isSupabaseBrowserConfigured } from '../lib/supabaseBrowser';

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
};

export function LoginModal({ open, onClose, title = '登录后投稿' }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSend = async () => {
    setError(null);
    setMessage(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('请输入邮箱');
      return;
    }
    if (!isSupabaseBrowserConfigured()) {
      setError('未配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
      return;
    }
    setSending(true);
    try {
      const supabase = getSupabaseBrowser();
      const redirect = `${window.location.origin}${window.location.pathname}`;
      const { error: err } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirect },
      });
      if (err) {
        setError(err.message);
        return;
      }
      setMessage('已发送登录链接，请查收邮件并点击链接完成登录。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div className="relative w-full max-w-sm bg-surface border border-outline-variant/30 p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-on-surface-variant hover:text-on-surface"
          aria-label="关闭"
        >
          <X size={20} />
        </button>
        <h2 id="login-modal-title" className="font-serif text-xl text-primary tracking-tight pr-8">
          {title}
        </h2>
        <p className="mt-2 text-sm text-on-surface-variant">
          使用邮箱收取 Magic Link，无需密码。若未收到，请检查垃圾箱。
        </p>
        <label className="mt-4 block text-[10px] uppercase tracking-widest text-on-surface-variant">
          邮箱
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full bg-surface-low border border-outline-variant/40 px-3 py-2 text-on-surface font-sans text-sm"
          placeholder="you@example.com"
          autoComplete="email"
        />
        {error && <p className="mt-2 text-sm text-tertiary">{error}</p>}
        {message && <p className="mt-2 text-sm text-primary">{message}</p>}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="mt-4 w-full py-3 bg-primary text-surface font-bold tracking-widest uppercase text-xs disabled:opacity-50"
        >
          {sending ? '发送中…' : '发送登录链接'}
        </button>
      </div>
    </div>
  );
}
