import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Mic, 
  Send, 
  ArrowLeft, 
  HelpCircle, 
  Share2, 
  Home as HomeNavIcon,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  RefreshCw,
  FileText,
  X,
  Keyboard,
  Menu,
} from 'lucide-react';
import {
  riddles,
  mergeRiddlePools,
  pickRandomRiddleFromPool,
  formatDifficultyLabel,
  riddleSummary,
  type Riddle,
} from './data/riddles';
import { askHost, type CozeConversationState } from './lib/cozeHost';
import { recordGameEnd, subscribeProgress, getProgress, type ProgressMap } from './lib/playerProgress';
import { isSpeechToTextSupported, startSpeechToText, stopSpeechToText } from './lib/speechToText';
import { isWeChatMiniProgramWebView } from './lib/wechatEnv';
import { apiUrl, canUseRemoteApi } from './lib/apiBase';
import {
  addSubmission,
  listSubmissions,
  submissionStatusLabel,
  type RiddleSubmission,
  type SoupType,
  type SubmissionStatus,
} from './lib/riddleSubmissions';
import { LoginModal } from './components/LoginModal';
import {
  clearAuthSession,
  clearCozeRuntimeUserId,
  getWechatAccessToken,
  setCozeRuntimeUserIdFromSupabase,
} from './lib/authSession';
import { getSupabaseBrowser, isSupabaseBrowserConfigured } from './lib/supabaseBrowser';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 判断主持人是否宣告本局通关。关键词须与 Coze 海龟汤 Bot 的通关话术一致（例如「解谜成功！」）；
 * 若你在扣子侧修改通关文案，请同步更新此列表。长期可改为 BFF 返回结构化字段（如 story_end）。
 */
function hostIndicatesSuccess(hostText: string): boolean {
  const t = hostText;
  return (
    t.includes('恭喜') ||
    t.includes('真相') ||
    t.includes('揭开') ||
    t.includes('解谜成功') ||
    t.includes('通关')
  );
}

/**
 * 判断主持人是否宣告本局因投降/放弃而结束。须与 Coze 海龟汤 Bot 的固定话术一致；
 * 若你在扣子侧修改该句，请同步更新此处。
 */
function hostIndicatesGiveUp(hostText: string): boolean {
  return hostText.includes('本轮失败');
}

/** 简单 20 / 中等 25 / 困难 30；未知或非标准值按中等处理 */
function maxQuestionAttemptsForDifficulty(raw: string): number {
  const d = raw.trim().toLowerCase();
  if (d === 'easy') return 20;
  if (d === 'hard') return 30;
  if (d === 'medium') return 25;
  return 25;
}

type FinishReason = 'win' | 'give_up' | 'out_of_turns';

interface GameFinishPayload {
  success: boolean;
  count: number;
  elapsedMs: number;
  bottomText: string;
  finishReason: FinishReason;
  riddleId: string;
  maxQuestionLimit: number;
}

function failureGradeTitle(finishReason: 'give_up' | 'out_of_turns', count: number): string {
  if (finishReason === 'give_up') return '遗憾离场';
  if (count <= 7) return '差一口气';
  if (count <= 14) return '迷雾重重';
  return '铩羽而归';
}

function failureGradeSubtitle(finishReason: 'give_up' | 'out_of_turns', count: number): string {
  if (finishReason === 'give_up') return '主动放弃本局';
  if (count <= 7) return '次数用尽 · 已接近真相';
  if (count <= 14) return '次数用尽 · 仍可深挖';
  return '次数用尽';
}

// --- Types ---
type View = 'home' | 'game' | 'profile' | 'rules' | 'history' | 'submit' | 'developing';

/** 主内容区与顶栏同宽，大屏适当加宽 */
const SHELL_MAX =
  'w-full max-w-md lg:max-w-3xl xl:max-w-4xl mx-auto';

const SHELL_INNER =
  'w-full max-w-md lg:max-w-3xl xl:max-w-4xl';

interface Message {
  id: string;
  role: 'user' | 'host';
  text: string;
}

// --- Components ---

const Layout = ({
  children,
  activeTab,
  onTabChange,
  userLabel,
}: {
  children: React.ReactNode;
  activeTab: View;
  onTabChange: (v: View) => void | Promise<void>;
  /** 顶栏右侧展示：已登录邮箱或未登录文案 */
  userLabel: string;
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const linkClass = (tab: View) =>
    `text-[10px] sm:text-xs uppercase tracking-widest font-bold transition-colors ${
      activeTab === tab ? 'text-primary' : 'text-on-surface/40 hover:text-on-surface/70'
    }`;

  const go = (v: View) => {
    void onTabChange(v);
    setDrawerOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface relative">
      <header className="sticky top-0 z-50 border-b border-outline-variant/10 bg-surface/95 backdrop-blur-sm">
        <div className={`relative flex items-center justify-between gap-2 px-3 sm:px-4 py-3 min-h-[3.25rem] ${SHELL_MAX}`}>
          <button
            type="button"
            onClick={() => go('home')}
            className="font-serif text-sm sm:text-lg text-primary tracking-[0.15em] sm:tracking-[0.2em] shrink-0 max-w-[38%] text-left leading-tight"
          >
            深夜海龟汤
          </button>

          <nav
            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 sm:gap-6 md:gap-8 pointer-events-auto"
            aria-label="主导航"
          >
            <button type="button" onClick={() => go('home')} className={linkClass('home')}>
              汤谱
            </button>
            <button type="button" onClick={() => go('rules')} className={linkClass('rules')}>
              玩法简介
            </button>
            <button type="button" onClick={() => go('developing')} className={linkClass('developing')}>
              每日一汤
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2 min-w-0 max-w-[38%] justify-end">
            <button
              type="button"
              onClick={() => go('profile')}
              className="min-w-0 truncate text-right text-[11px] sm:text-xs font-medium text-on-surface hover:text-primary transition-colors px-1"
              title={userLabel}
            >
              {userLabel}
            </button>
            <button
              type="button"
              className="md:hidden p-2 text-on-surface -mr-2 shrink-0"
              onClick={() => setDrawerOpen(true)}
              aria-label="打开菜单"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-[120]">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="关闭菜单"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute top-0 right-0 bottom-0 flex w-[min(85vw,280px)] flex-col gap-1 border-l border-outline-variant/20 bg-surface p-6 shadow-xl">
            <p className="mb-2 font-serif text-xs text-on-surface-variant truncate" title={userLabel}>
              {userLabel}
            </p>
            <p className="mb-4 font-serif text-sm text-on-surface-variant">导航</p>
            <button type="button" onClick={() => go('home')} className={`py-3 text-left ${linkClass('home')}`}>
              汤谱
            </button>
            <button type="button" onClick={() => go('rules')} className={`py-3 text-left ${linkClass('rules')}`}>
              玩法简介
            </button>
            <button
              type="button"
              onClick={() => go('developing')}
              className={`py-3 text-left ${linkClass('developing')}`}
            >
              每日一汤
            </button>
            <button type="button" onClick={() => go('profile')} className={`py-3 text-left ${linkClass('profile')}`}>
              个人中心
            </button>
          </div>
        </div>
      )}

      <div className={`flex-grow overflow-y-auto no-scrollbar pb-12 ${SHELL_MAX}`}>{children}</div>
    </div>
  );
};

const RiddleCard = ({
  riddle,
  onClick,
  played,
  cleared,
}: {
  riddle: Riddle;
  onClick: () => void;
  played: boolean;
  cleared: boolean;
}) => {
  const d = riddle.difficulty.toLowerCase();
  const isHard = d === 'hard';
  const isMedium = d === 'medium';

  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group flex flex-col gap-4 p-5 bg-surface-low transition-colors hover:bg-surface-high cursor-pointer ${riddle.id === '2' ? 'asymmetric-offset-right' : ''}`}
    >
      <div className="flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`font-serif text-2xl text-on-surface group-hover:text-primary transition-colors`}>
            {riddle.title}
          </h3>
          {cleared && (
            <span className="text-[9px] px-2 py-0.5 tracking-widest bg-secondary/25 text-secondary border border-secondary/40">
              已通关
            </span>
          )}
          {!cleared && played && (
            <span className="text-[9px] px-2 py-0.5 tracking-widest bg-on-surface-variant/15 text-on-surface-variant border border-outline-variant/40">
              已玩
            </span>
          )}
        </div>
        <p className="font-serif text-sm text-on-surface-variant leading-relaxed line-clamp-2">
          {riddleSummary(riddle.surface, 100)}
        </p>
      </div>
      <div className="flex justify-between items-end">
        <div className="flex gap-2">
          <span className={`text-[10px] px-2 py-0.5 font-bold tracking-widest ${isHard ? 'bg-on-surface-variant text-surface' : isMedium ? 'bg-primary/20 text-primary' : 'bg-secondary/20 text-secondary'}`}>
            {formatDifficultyLabel(riddle.difficulty)}
          </span>
          <span className="text-[10px] px-2 py-0.5 border border-outline-variant text-on-surface-variant">
            {riddle.type}
          </span>
        </div>
        <ChevronRight size={16} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </motion.div>
  );
};

// --- Views ---

type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

const DIFFICULTY_FILTER_OPTIONS: { value: DifficultyFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'easy', label: formatDifficultyLabel('easy') },
  { value: 'medium', label: formatDifficultyLabel('medium') },
  { value: 'hard', label: formatDifficultyLabel('hard') },
];

const HomeView = ({
  onSelectRiddle,
  progressMap,
  riddlePool,
}: {
  onSelectRiddle: (r: Riddle) => void;
  progressMap: ProgressMap;
  riddlePool: Riddle[];
}) => {
  const [bannerRiddle, setBannerRiddle] = useState<Riddle>(() => pickRandomRiddleFromPool(riddlePool));
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const bannerProg = progressMap[bannerRiddle.id];

  const uniqueTypes = useMemo(() => {
    const s = new Set(riddlePool.map((r) => r.type.trim()).filter(Boolean));
    return [...s].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [riddlePool]);

  const filteredRiddles = useMemo(() => {
    return riddlePool.filter((r) => {
      if (difficultyFilter !== 'all' && r.difficulty.trim().toLowerCase() !== difficultyFilter) {
        return false;
      }
      if (typeFilter !== 'all' && r.type.trim() !== typeFilter) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.surface.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    });
  }, [riddlePool, searchQuery, difficultyFilter, typeFilter]);

  const handleRandomSoup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBannerRiddle(pickRandomRiddleFromPool(riddlePool, bannerRiddle.id));
  };

  return (
    <div className="p-6 space-y-12">
      <section 
        onClick={() => onSelectRiddle(bannerRiddle)}
        className="relative group cursor-pointer bg-surface-lowest overflow-hidden"
      >
        <div className="absolute inset-0 opacity-40 grayscale transition-all duration-700">
          <img 
            src="https://picsum.photos/seed/alchemist-mystery-bg/800/400?grayscale" 
            alt="Hero" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="relative p-8 flex flex-col justify-end min-h-[260px] bg-gradient-to-t from-surface via-surface/60 to-transparent">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] uppercase tracking-[0.2em] text-primary bg-surface/80 px-2 py-1 w-fit">随机调汤</span>
            <button 
              onClick={handleRandomSoup}
              className="text-on-surface-variant hover:text-primary transition-colors p-1"
            >
              <motion.div whileTap={{ rotate: 180 }}>
                <RefreshCw size={20} />
              </motion.div>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="font-serif text-3xl text-on-surface asymmetric-offset">{bannerRiddle.title}</h2>
            {bannerProg?.cleared && (
              <span className="text-[9px] px-2 py-0.5 tracking-widest bg-secondary/25 text-secondary border border-secondary/40">
                已通关
              </span>
            )}
            {!bannerProg?.cleared && bannerProg?.played && (
              <span className="text-[9px] px-2 py-0.5 tracking-widest bg-on-surface-variant/20 text-on-surface-variant border border-outline-variant/40">
                已玩
              </span>
            )}
          </div>
          <p className="font-serif text-sm text-on-surface-variant leading-relaxed italic">
            “{riddleSummary(bannerRiddle.surface, 60)}”
          </p>
          <div className="mt-6 flex items-center gap-2 text-primary text-xs tracking-widest font-bold">
            <span>开始入局</span>
            <ChevronRight size={14} />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="font-serif text-4xl text-on-surface italic border-b-2 border-surface-low pb-4">汤谱</h2>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索汤名或关键词..." 
            className="w-full bg-surface-low border-none focus:ring-1 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant/50 pl-12 py-3 text-sm tracking-wider"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="riddle-filter-difficulty" className="text-[10px] uppercase tracking-widest text-on-surface-variant/70 block">
              难度
            </label>
            <select
              id="riddle-filter-difficulty"
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value as DifficultyFilter)}
              className="w-full bg-surface-low border border-outline-variant/30 text-on-surface text-sm py-3 px-3 tracking-wider focus:ring-1 focus:ring-primary/50 focus:outline-none appearance-none cursor-pointer"
            >
              {DIFFICULTY_FILTER_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="riddle-filter-type" className="text-[10px] uppercase tracking-widest text-on-surface-variant/70 block">
              标签
            </label>
            <select
              id="riddle-filter-type"
              value={typeFilter === 'all' ? '' : typeFilter}
              onChange={(e) => setTypeFilter(e.target.value === '' ? 'all' : e.target.value)}
              className="w-full bg-surface-low border border-outline-variant/30 text-on-surface text-sm py-3 px-3 tracking-wider focus:ring-1 focus:ring-primary/50 focus:outline-none appearance-none cursor-pointer"
            >
              <option value="">全部</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-8">
          {filteredRiddles.length === 0 ? (
            <p className="text-sm text-on-surface-variant pl-1">
              没有匹配的汤，试试调整难度或标签筛选，或换个关键词。
            </p>
          ) : (
            filteredRiddles.map((r) => (
              <div key={r.id}>
                <RiddleCard
                  riddle={r}
                  played={!!progressMap[r.id]?.played}
                  cleared={!!progressMap[r.id]?.cleared}
                  onClick={() => onSelectRiddle(r)}
                />
              </div>
            ))
          )}
        </div>

        <footer className="pt-8 border-t border-outline-variant/10 space-y-3 text-center text-xs text-on-surface-variant leading-relaxed font-serif">
          <p>本站题目来源于互联网公开内容，仅供娱乐学习使用，非商业用途。</p>
          <p>
            如有侵权请联系{' '}
            <a href="mailto:shenpinghuang@163.com" className="text-primary underline-offset-2 hover:underline">
              shenpinghuang@163.com
            </a>
            ，核实后将立即删除。
          </p>
        </footer>
      </section>
    </div>
  );
};

const PuzzleDetailModal = ({ riddle, onClose, onStart }: { riddle: Riddle; onClose: () => void; onStart: () => void }) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-surface/80 backdrop-blur-md"
    >
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-[min(66vw,36rem)] sm:max-w-xl bg-surface-low shadow-2xl ring-1 ring-outline-variant/30 flex flex-col overflow-hidden"
      >
        <div className="p-8 md:p-12 overflow-y-auto max-h-[80vh]">
          <div className="flex justify-end mb-4">
            <button onClick={onClose} className="text-on-surface-variant hover:text-primary transition-colors">
              <X size={24} />
            </button>
          </div>
          <div className="text-center mb-8">
            <h2 className="font-serif text-4xl text-on-surface mb-2 asymmetric-offset">{riddle.title}</h2>
            <div className="flex justify-center gap-3 mt-4">
              <span className="px-3 py-1 border border-secondary/30 text-secondary text-xs tracking-widest uppercase bg-secondary/5">{formatDifficultyLabel(riddle.difficulty)}</span>
              <span className="px-3 py-1 border border-primary/30 text-primary text-xs tracking-widest uppercase bg-primary/5">{riddle.type}</span>
            </div>
          </div>
          <div className="space-y-6 text-on-surface-variant leading-relaxed text-lg font-serif">
            <p>{riddle.surface}</p>
          </div>
        </div>
        <div className="p-6 bg-surface-low border-t border-outline-variant/10">
          <button 
            onClick={onStart}
            className="w-full py-5 bg-surface-high text-primary border border-primary/20 font-bold tracking-[0.2em] uppercase text-sm hover:bg-surface-highest active:scale-[0.99] transition-all"
          >
            开始游戏
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const GameRoomView = ({
  riddle,
  onBack,
  onFinish,
  onShowRules,
}: {
  riddle: Riddle;
  onBack: () => void;
  onFinish: (payload: GameFinishPayload) => void;
  onShowRules: () => void;
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [speechListening, setSpeechListening] = useState(false);
  const [sttBanner, setSttBanner] = useState<string | null>(null);
  const inMiniProgramWebView = useMemo(() => isWeChatMiniProgramWebView(), []);
  const sttOk = isSpeechToTextSupported();
  const voiceAllowed = sttOk && !inMiniProgramWebView;
  const maxAttempts = maxQuestionAttemptsForDifficulty(riddle.difficulty);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gameStartedAtRef = useRef<number>(Date.now());
  const cozeConvRef = useRef<CozeConversationState>({});

  useEffect(() => {
    gameStartedAtRef.current = Date.now();
    cozeConvRef.current = {};
  }, [riddle.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      stopSpeechToText();
    };
  }, []);

  useEffect(() => {
    if (inMiniProgramWebView) setIsVoiceMode(false);
  }, [inMiniProgramWebView]);

  const buildFinish = (
    success: boolean,
    count: number,
    elapsedMs: number,
    finishReason: FinishReason,
  ): GameFinishPayload => ({
    success,
    count,
    elapsedMs,
    bottomText: riddle.bottom,
    finishReason,
    riddleId: riddle.id,
    maxQuestionLimit: maxAttempts,
  });

  const handleGiveUp = () => {
    if (loading) return;
    if (!window.confirm('确定放弃本局？将立即结算，本局计为失败。')) return;
    const elapsedMs = Date.now() - gameStartedAtRef.current;
    onFinish(buildFinish(false, attempts, elapsedMs, 'give_up'));
  };

  const handleSend = async () => {
    if (!input.trim() || loading || attempts >= maxAttempts) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    const question = input;
    setInput('');
    setLoading(true);
    setAttempts((prev) => prev + 1);

    const history = messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));
    const response = await askHost(
      riddle.surface,
      riddle.bottom,
      question,
      history,
      cozeConvRef.current,
    );

    const hostMsg: Message = { id: (Date.now() + 1).toString(), role: 'host', text: response };
    setMessages((prev) => [...prev, hostMsg]);
    setLoading(false);

    const usedAttempts = attempts + 1;
    const elapsedMs = Date.now() - gameStartedAtRef.current;
    const hostOffline = response.includes('汤主走神了');

    if (!hostOffline && hostIndicatesSuccess(response)) {
      setTimeout(() => onFinish(buildFinish(true, usedAttempts, elapsedMs, 'win')), 1500);
    } else if (!hostOffline && hostIndicatesGiveUp(response)) {
      setTimeout(() => onFinish(buildFinish(false, usedAttempts, elapsedMs, 'give_up')), 1500);
    } else if (usedAttempts >= maxAttempts) {
      setTimeout(() => onFinish(buildFinish(false, usedAttempts, elapsedMs, 'out_of_turns')), 1500);
    }
  };

  const startHoldSpeech = () => {
    if (!voiceAllowed) return;
    setSttBanner(null);
    setSpeechListening(true);
    startSpeechToText({
      onResult: (text) => {
        if (text) setInput(text);
      },
      onError: (msg) => setSttBanner(msg),
      onEnd: () => setSpeechListening(false),
    });
  };

  const endHoldSpeech = () => {
    stopSpeechToText();
    setSpeechListening(false);
  };

  return (
    <div className="flex flex-col h-screen bg-surface">
      <header className={`fixed top-0 left-1/2 -translate-x-1/2 ${SHELL_INNER} flex justify-between items-center px-4 min-h-[3.25rem] pt-[env(safe-area-inset-top,0px)] pb-1 bg-surface border-b border-outline-variant/10 z-50`}>
        <div className="flex items-center gap-1">
          <button onClick={onBack} className="p-2 text-primary hover:bg-primary/10 transition-all">
            <ArrowLeft size={24} />
          </button>
        </div>
        <h1 className="text-xl font-serif font-bold text-primary tracking-[0.25em] max-w-[55%] truncate text-center">
          {riddle.title}
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={onShowRules} className="p-2 text-primary hover:bg-primary/10 transition-all">
            <HelpCircle size={24} />
          </button>
        </div>
      </header>

      <main className="pt-[calc(env(safe-area-inset-top,0px)+4rem)] pb-36 flex-grow flex flex-col min-h-0 overflow-hidden">
        <div className={`mx-auto ${SHELL_MAX} w-full flex flex-col flex-1 min-h-0 px-4`}>
        <div className="shrink-0 pt-2 pb-2">
          <div className="bg-surface-low p-5 relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-surface-highest rotate-12 opacity-40"></div>
            <div className="relative z-10 flex flex-col gap-0">
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] tracking-widest text-on-surface-variant uppercase">案件编号 #{riddle.id}</span>
                <div className="flex items-center gap-2">
                  <HelpCircle size={14} className="text-secondary" />
                  <span className="text-xs font-bold text-secondary">{formatDifficultyLabel(riddle.difficulty)}</span>
                </div>
              </div>
              <div className="bg-surface-highest h-1 w-24 mb-3 shrink-0"></div>
              <div className="max-h-[min(40vh,280px)] min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y pr-1 -mr-1">
                <p className="font-serif text-lg text-on-surface leading-relaxed whitespace-pre-wrap">{riddle.surface}</p>
              </div>
              <div className="mt-5 pt-3 border-t border-outline-variant/20 shrink-0">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant opacity-70">尝试余量</span>
                  <span className="text-xs font-bold text-primary">{maxAttempts - attempts} / {maxAttempts}</span>
                </div>
                <div className="h-1 w-full bg-surface-highest overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500" 
                    style={{ width: `${((maxAttempts - attempts) / maxAttempts) * 100}%` }}
                  ></div>
                </div>
                <button
                  type="button"
                  onClick={handleGiveUp}
                  disabled={loading}
                  className="mt-3 text-[10px] tracking-widest text-on-surface-variant hover:text-primary underline-offset-2 hover:underline disabled:opacity-40"
                >
                  放弃本局
                </button>
              </div>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-grow min-h-0 pt-2 pb-3 space-y-10 overflow-y-auto no-scrollbar">
          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end pr-4' : 'justify-start pl-4'}`}>
              <div className={`max-w-[85%] p-4 relative ${m.role === 'user' ? 'bg-surface-highest' : 'bg-surface-low border-l-4 border-primary/30'}`}>
                <p className={`font-serif leading-relaxed ${m.role === 'host' ? 'text-xl font-bold' : 'text-base'}`}>
                  {m.text}
                </p>
                <div className={`absolute top-0 w-2 h-2 ${m.role === 'user' ? '-right-2 bg-surface-highest' : '-left-2 bg-surface-low'}`}></div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start pl-4 animate-pulse">
              <div className="bg-surface-low p-4 border-l-4 border-primary/30">
                <p className="font-serif text-xl font-bold text-on-surface-variant">...</p>
              </div>
            </div>
          )}
        </div>
        </div>
      </main>

      <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 ${SHELL_INNER} z-50 bg-surface border-t border-outline-variant/10 pt-2 px-4 space-y-2 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]`}>
        {inMiniProgramWebView && (
          <p className="text-[10px] text-on-surface-variant leading-relaxed px-1">
            小程序内请使用文字输入提问。
          </p>
        )}
        {isVoiceMode && !sttOk && !inMiniProgramWebView && (
          <p className="text-[10px] text-on-surface-variant leading-relaxed px-1">
            当前环境不支持浏览器语音识别（微信小游戏需单独接入）。请点左侧键盘图标改用文字输入。
          </p>
        )}
        {sttBanner && (
          <p className="text-[10px] text-primary px-1">{sttBanner}</p>
        )}
        {isVoiceMode && voiceAllowed && (
          <p className="text-[10px] text-on-surface-variant px-1">按住麦克风说话，松开后识别为文字填入框内，再点发送。</p>
        )}
        <div className="flex items-center gap-3">
          {!inMiniProgramWebView && (
            <button 
              type="button"
              onClick={() => {
                endHoldSpeech();
                setIsVoiceMode(!isVoiceMode);
                setSttBanner(null);
              }}
              className="w-12 h-12 shrink-0 flex items-center justify-center border border-primary/30 bg-surface-high text-primary hover:bg-surface-highest active:scale-95 transition-all"
            >
              {isVoiceMode ? <Keyboard size={24} /> : <Mic size={24} />}
            </button>
          )}
          <div className="flex-grow flex items-center bg-surface-low border border-outline-variant/30 shadow-2xl overflow-hidden min-h-[3rem]">
            {isVoiceMode && voiceAllowed ? (
              <div
                className="flex-grow flex flex-col items-stretch justify-center gap-2 py-2 px-2 min-h-[3rem]"
                onPointerLeave={voiceAllowed ? endHoldSpeech : undefined}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void handleSend()}
                  placeholder="识别结果可修改后发送"
                  className="w-full bg-transparent border-b border-outline-variant/30 py-1.5 text-sm font-serif text-on-surface placeholder:text-on-surface-variant/40"
                />
                <div className="flex items-center justify-center gap-1.5 py-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <motion.div
                      key={i}
                      animate={
                        speechListening && voiceAllowed
                          ? { height: [8, 24, 12, 28, 10] }
                          : { height: 8 }
                      }
                      transition={{
                        repeat: speechListening && voiceAllowed ? Infinity : 0,
                        duration: 0.8,
                        delay: i * 0.1,
                        ease: 'easeInOut',
                      }}
                      className="w-1 bg-primary/60 rounded-full"
                    />
                  ))}
                </div>
                {voiceAllowed && (
                  <button
                    type="button"
                    className="py-2 text-[10px] tracking-widest text-primary border border-primary/30 bg-surface-high select-none touch-none"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      startHoldSpeech();
                    }}
                    onPointerUp={endHoldSpeech}
                    onPointerCancel={endHoldSpeech}
                  >
                    {speechListening ? '松开结束' : '按住说话'}
                  </button>
                )}
              </div>
            ) : (
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void handleSend()}
                placeholder="向先知提问..." 
                className="flex-grow bg-transparent border-none focus:ring-0 py-3 px-2 font-serif text-on-surface placeholder:text-on-surface-variant/40"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || attempts >= maxAttempts || !input.trim()}
            className="w-12 h-12 shrink-0 flex items-center justify-center border border-primary/30 bg-primary text-surface hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
            aria-label="发送"
          >
            <Send size={22} />
          </button>
        </div>
      </div>
    </div>
  );
};

const SettlementView = ({
  success,
  count,
  maxQuestionLimit,
  elapsedMs,
  bottomText,
  finishReason,
  onHome,
}: {
  success: boolean;
  count: number;
  maxQuestionLimit: number;
  elapsedMs: number;
  bottomText: string;
  finishReason: FinishReason;
  onHome: () => void;
}) => {
  const [bottomOpen, setBottomOpen] = useState(false);
  const successGrade = count <= 5 ? '神探' : count <= 12 ? '老警探' : '有点悬';
  const failReason: 'give_up' | 'out_of_turns' =
    finishReason === 'give_up' ? 'give_up' : 'out_of_turns';
  const failTitle = !success ? failureGradeTitle(failReason, count) : '';
  const failSub = !success ? failureGradeSubtitle(failReason, count) : '';

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const handleShareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        window.alert('复制失败，请长按地址栏链接手动复制');
        return;
      }
    }
    setShareFeedback('已复制链接，去分享吧～');
    window.setTimeout(() => setShareFeedback(null), 2800);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/90 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`${SHELL_INNER} bg-surface border border-outline-variant/30 relative overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div className="absolute inset-0 bg-gradient-radial from-primary/5 to-transparent pointer-events-none opacity-60"></div>
        <div className="absolute top-4 left-4 z-10">
          <div className="border border-outline/40 bg-surface-high px-2 py-0.5">
            <span className="text-[9px] tracking-[0.2em] text-on-surface-variant uppercase">
              {success ? '成功通关 SUCCESS' : '挑战结束 ENDED'}
            </span>
          </div>
        </div>

        <div className="overflow-y-auto no-scrollbar p-6 pt-12 space-y-8 relative z-20">
          <header className="text-center space-y-2 pt-4">
            <div className="relative inline-block">
              <h2 className={`font-serif text-5xl italic tracking-tight ${success ? 'shimmer-gold' : 'text-on-surface-variant'}`}>
                {success ? successGrade : failTitle}
              </h2>
              <p className="text-[10px] tracking-[0.3em] uppercase text-on-surface-variant/60 mt-1">
                {success ? 'MASTER DETECTIVE' : failSub}
              </p>
            </div>
            <div className="w-12 h-px bg-gradient-to-r from-transparent via-outline/30 to-transparent mx-auto mt-4"></div>
          </header>

          {success && (
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-outline/20"></div>
                <h3 className="font-serif text-base italic text-secondary tracking-widest">汤底揭秘</h3>
                <div className="h-px flex-1 bg-outline/20"></div>
              </div>
              <div className="bg-surface-high/40 border border-outline/10 p-5">
                <p className="text-on-surface leading-relaxed text-sm text-justify whitespace-pre-wrap">
                  {bottomText.trim() || '（暂无汤底文案）'}
                </p>
              </div>
            </section>
          )}

          {!success && (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setBottomOpen((o) => !o)}
                className="w-full flex items-center justify-between gap-2 py-3 px-4 border border-outline-variant/30 bg-surface-low text-left text-sm font-serif text-primary tracking-widest"
              >
                <span>{bottomOpen ? '收起汤底' : '展开汤底'}</span>
                {bottomOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {bottomOpen && (
                <div className="bg-surface-high/40 border border-outline/10 p-5">
                  <p className="text-on-surface leading-relaxed text-sm text-justify whitespace-pre-wrap">
                    {bottomText.trim() || '（暂无汤底文案）'}
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="grid grid-cols-3 gap-2">
            <div className="bg-surface-low py-3 px-1 border-l border-primary/20 flex flex-col items-center justify-center">
              <span className="text-[8px] uppercase tracking-widest text-on-surface-variant opacity-60">用时</span>
              <span className="font-serif text-xl text-on-surface tracking-tighter">{formatElapsed(elapsedMs)}</span>
            </div>
            <div className="bg-surface-low py-3 px-1 border-l border-primary/20 flex flex-col items-center justify-center">
              <span className="text-[8px] uppercase tracking-widest text-on-surface-variant opacity-60">提问</span>
              <span className="font-serif text-xl text-on-surface tracking-tighter">{count}/{maxQuestionLimit}</span>
            </div>
            <div className="bg-surface-low py-3 px-1 border-l border-secondary/20 flex flex-col items-center justify-center">
              <span className="text-[8px] uppercase tracking-widest text-on-surface-variant opacity-60">提示</span>
              <span className="font-serif text-xl text-secondary tracking-tighter">0</span>
            </div>
          </section>

          <footer className="flex flex-col gap-3 pt-4">
            {shareFeedback && (
              <p className="text-center text-sm text-primary font-serif tracking-wide">{shareFeedback}</p>
            )}
            <button
              type="button"
              onClick={() => void handleShareLink()}
              className="bg-primary text-surface font-bold py-4 tracking-[0.2em] uppercase text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Share2 size={18} />
              分享我的旅程
            </button>
            <button 
              onClick={onHome}
              className="bg-transparent border border-outline/20 text-secondary py-4 tracking-[0.2em] uppercase text-xs flex items-center justify-center gap-2 active:bg-white/5 transition-all"
            >
              <HomeNavIcon size={18} />
              返回首页
            </button>
          </footer>
        </div>
      </motion.div>
    </div>
  );
};

const ProfileView = ({
  onNavigate,
  userEmail,
  onLogout,
  onRequestLogin,
}: {
  onNavigate: (v: View) => void | Promise<void>;
  userEmail: string | null;
  onLogout: () => void | Promise<void>;
  /** 未登录时点击访客卡片打开 Magic Link */
  onRequestLogin: () => void | Promise<void>;
}) => {
  return (
    <div className="p-6 space-y-12">
      <section className="mt-8 md:mt-12">
        <div
          role={!userEmail ? 'button' : undefined}
          tabIndex={!userEmail ? 0 : undefined}
          onClick={
            !userEmail
              ? () => {
                  void onRequestLogin();
                }
              : undefined
          }
          onKeyDown={
            !userEmail
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void onRequestLogin();
                  }
                }
              : undefined
          }
          className={`bg-surface-low p-6 flex items-center gap-6 ${
            !userEmail ? 'cursor-pointer hover:bg-surface-high transition-colors' : ''
          }`}
        >
          <div className="w-20 h-20 bg-surface-highest relative flex items-center justify-center overflow-hidden shrink-0">
            <img 
              src="https://picsum.photos/seed/profile/200/200" 
              alt="Avatar" 
              className="w-full h-full object-cover grayscale opacity-80"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif text-2xl font-bold tracking-tight truncate">
              {userEmail ? userEmail : '访客'}
            </h2>
            {!userEmail && (
              <p className="mt-1 text-xs text-on-surface-variant">登录后可提交谜题（邮箱 Magic Link）</p>
            )}
            {userEmail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onLogout();
                }}
                className="mt-2 text-xs uppercase tracking-widest text-primary/90 hover:text-primary"
              >
                退出登录
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-[11px] uppercase tracking-[0.2em] opacity-50 ml-2">投稿</h3>
        <div className="space-y-1">
          <button 
            onClick={() => void onNavigate('submit')}
            className="w-full bg-surface-low p-5 flex items-center justify-between group hover:bg-surface-high transition-colors"
          >
            <span className="font-serif text-lg italic">提交谜题</span>
            <ChevronRight size={18} className="opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </button>
          <button 
            onClick={() => void onNavigate('history')}
            className="w-full bg-surface-low p-5 flex items-center justify-between group hover:bg-surface-high transition-colors"
          >
            <span className="font-serif text-lg italic">投稿记录</span>
            <ChevronRight size={18} className="opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </button>
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-[11px] uppercase tracking-[0.2em] opacity-50 ml-2">游戏数据</h3>
        <div className="space-y-1">
          <button 
            type="button"
            disabled
            aria-disabled
            className="w-full bg-surface-low p-5 flex items-center justify-between opacity-40 cursor-not-allowed"
          >
            <span className="font-serif text-lg italic">游戏统计</span>
            <TrendingUp size={18} className="opacity-30" />
          </button>
        </div>
      </section>
    </div>
  );
};

const DevelopingView = ({ onBack, showBack = true }: { onBack: () => void, showBack?: boolean }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-6 relative">
      {showBack && (
        <button onClick={onBack} className="absolute top-6 left-6 p-2 text-primary">
          <ArrowLeft size={24} />
        </button>
      )}
      <div className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold italic tracking-tighter text-on-surface animate-pulse">
          秘境探索中……
        </h1>
        <p className="text-base md:text-lg text-on-surface-variant">
          界面和功能正在开发，敬请期待。
        </p>
      </div>
    </div>
  );
};

/** 玩法正文：对局内全屏规则页与首页壳内「玩法简介」共用 */
const GameplayGuideContent = () => (
  <>
    <section className="space-y-8">
      <h1 className="text-3xl md:text-4xl font-bold text-primary tracking-tight">海龟汤基本玩法</h1>
      <div className="space-y-6 text-on-surface text-lg leading-relaxed font-serif">
        <p>
          海龟汤是一种情境推理游戏。游戏开始时，汤主会给出一个离奇的故事情节（即“汤面”），通常只包含结局。你的任务是通过不断提问，拼凑出完整的故事情节（即“汤底”）。
        </p>
        <p>
          在推理过程中，汤主只能对你的提问做出四种回答：<span className="text-primary font-bold">是 (YES)</span>、<span className="text-secondary font-bold">不是 (NO)</span>、<span className="text-tertiary font-bold">是也不是 (YES AND NO)</span>，或者<span className="text-on-surface-variant font-bold">不重要 (IRRELEVANT)</span>。通过这些碎片化的反馈，你需要一步步还原出深藏在迷雾中的真相。
        </p>
      </div>
    </section>
    <section className="space-y-8">
      <h2 className="text-3xl md:text-4xl font-bold text-primary tracking-tight">温馨提示</h2>
      <div className="space-y-6 text-on-surface text-lg leading-relaxed font-serif">
        <p>
          每局游戏都有提问次数上限（随题目难度变化：简单、中等、困难对应不同次数），请谨慎珍惜每一次提问机会。你可以通过文字输入问题，也可以长按麦克风图标进行语音提问。
        </p>
        <p>
          如果你陷入了僵局，无法找到新的切入点，可以向汤主索要线索，但这将消耗一次提问机会。保持冷静，真相就在细节之中。
        </p>
        <p>
          当你觉得已接近真相时，不妨将故事<strong className="text-primary">尽量完整、连贯地复述</strong>给汤主听；完整叙事更容易对上主持人侧的通关判定，从而提高触发通关话术的成功率。
        </p>
      </div>
    </section>
  </>
);

const RulesView = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-surface min-h-screen">
      <header className="w-full sticky top-0 z-50 bg-surface border-b border-outline-variant/10">
        <nav className="flex items-center px-6 py-4">
          <button type="button" onClick={onBack} className="text-primary p-1" aria-label="返回">
            <ArrowLeft size={24} />
          </button>
        </nav>
      </header>
      <main className="max-w-2xl mx-auto px-8 pt-12 pb-24 space-y-20">
        <GameplayGuideContent />
      </main>
    </div>
  );
};

/** 无对局时，顶栏下展示的玩法简介（与对局内 RulesView 正文一致） */
const ShellGameplayGuide = ({ onBack }: { onBack: () => void }) => (
  <div className="px-4 pb-16 pt-2">
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-2 text-primary text-sm font-serif tracking-widest mb-8 hover:opacity-90"
    >
      <ArrowLeft size={22} />
      返回
    </button>
    <div className="max-w-2xl mx-auto space-y-20">
      <GameplayGuideContent />
    </div>
  </div>
);

const SubmitView = ({
  onBack,
  onSubmitted,
}: {
  onBack: () => void;
  onSubmitted?: () => void;
}) => {
  const [title, setTitle] = useState('');
  const [surface, setSurface] = useState('');
  const [bottom, setBottom] = useState('');
  const [selectedType, setSelectedType] = useState<SoupType>('清汤');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);
    try {
      const result = await addSubmission({
        title,
        surface,
        bottom,
        soupType: selectedType,
      });
      if (result.ok === false) {
        setFormError(result.error);
        return;
      }
      setFormSuccess('已提交服务器，管理员审核通过后将出现在汤谱中');
      setTitle('');
      setSurface('');
      setBottom('');
      setSelectedType('清汤');
      window.setTimeout(() => {
        onSubmitted?.();
      }, 1200);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-12 pb-28">
      <header className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="text-primary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-on-surface tracking-widest uppercase font-serif">贡献新汤</h1>
      </header>

      {formError && (
        <p className="text-sm text-tertiary border border-tertiary/30 bg-tertiary/10 px-4 py-3">{formError}</p>
      )}
      {formSuccess && (
        <p className="text-sm text-secondary border border-secondary/30 bg-secondary/10 px-4 py-3">{formSuccess}</p>
      )}

      <div className="space-y-8">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">谜题标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="此处刻下名字..."
            className="w-full bg-surface-low border border-outline-variant/30 p-4 font-serif text-lg focus:ring-1 focus:ring-primary/50 text-on-surface"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">汤面描述</label>
          <textarea
            rows={4}
            value={surface}
            onChange={(e) => setSurface(e.target.value)}
            placeholder="写下那令人不寒而栗的开端..."
            className="w-full bg-surface-low border border-outline-variant/30 p-4 font-serif text-base focus:ring-1 focus:ring-primary/50 text-on-surface"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">汤底答案</label>
          <textarea
            rows={4}
            value={bottom}
            onChange={(e) => setBottom(e.target.value)}
            placeholder="揭示背后隐藏的残酷真相..."
            className="w-full bg-surface-low border border-outline-variant/30 p-4 font-serif text-base focus:ring-1 focus:ring-primary/50 text-on-surface"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">汤底浓度</label>
          <div className="grid grid-cols-3 gap-2">
            {(['清汤', '红汤', '黑汤'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={`p-4 flex flex-col items-center gap-2 border transition-all ${
                  selectedType === t
                    ? 'bg-primary text-surface border-primary shadow-lg shadow-primary/20'
                    : 'bg-surface-low border-outline-variant/20 hover:border-primary/50'
                }`}
              >
                <div className={`w-8 h-8 flex items-center justify-center ${selectedType === t ? 'opacity-100' : 'opacity-60'}`}>
                  {t === '清汤' ? <HomeNavIcon size={20} /> : t === '红汤' ? <TrendingUp size={20} /> : <HelpCircle size={20} />}
                </div>
                <span className="text-xs font-serif">{t}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="w-full py-5 bg-primary text-surface font-bold tracking-[0.2em] uppercase text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
        >
          {submitting ? '提交中…' : (
            <>
              封印并提交 <FileText size={18} />
            </>
          )}
        </button>
        <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
          投稿发往服务端待审核；通过后将出现在汤谱。本机仍会保留一条记录便于查看状态（与清除缓存有关）。
        </p>
      </div>
    </div>
  );
};

function formatSubmissionDate(ts: number): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function submissionStatusClass(status: SubmissionStatus): string {
  if (status === 'pending') return 'text-secondary';
  if (status === 'approved') return 'shimmer-gold font-bold text-primary';
  if (status === 'rejected') return 'text-tertiary';
  return 'text-on-surface-variant';
}

function submissionBadgeClass(status: SubmissionStatus): string {
  if (status === 'pending') return 'bg-secondary/20 text-secondary';
  if (status === 'approved') return 'bg-primary/20 text-primary';
  if (status === 'rejected') return 'bg-tertiary/20 text-tertiary';
  return 'bg-on-surface-variant/20 text-on-surface-variant';
}

const HistoryView = ({
  onBack,
  onGoSubmit,
}: {
  onBack: () => void;
  onGoSubmit: () => void;
}) => {
  const [items, setItems] = useState<RiddleSubmission[]>(() => listSubmissions());
  const [selectedItem, setSelectedItem] = useState<RiddleSubmission | null>(null);

  useEffect(() => {
    setItems(listSubmissions());
  }, []);

  return (
    <div className="p-6 space-y-12 bg-surface min-h-screen pb-28">
      <header className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="text-primary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-on-surface tracking-widest uppercase font-serif">投稿记录</h1>
      </header>

      {items.length === 0 ? (
        <div className="space-y-6 py-12 text-center border border-outline-variant/20 bg-surface-low/50 px-6">
          <p className="text-on-surface-variant font-serif text-lg">暂无投稿记录</p>
          <p className="text-sm text-on-surface-variant/80">在「贡献新汤」提交成功后会在此显示；状态以服务端审核为准。</p>
          <button
            type="button"
            onClick={onGoSubmit}
            className="w-full max-w-xs mx-auto py-4 bg-primary text-surface font-bold tracking-widest uppercase text-xs hover:brightness-110 transition-all"
          >
            去贡献新汤
          </button>
        </div>
      ) : (
        <div className="space-y-0 border-y border-outline-variant/20">
          {items.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedItem(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedItem(item);
                }
              }}
              className="group relative py-8 border-b border-outline-variant/10 hover:bg-surface-low transition-colors cursor-pointer"
            >
              <div className="flex justify-between items-end gap-4">
                <div className="space-y-2 min-w-0 text-left">
                  <span className="text-[10px] text-primary/60 tracking-widest uppercase block truncate">
                    投稿 #{item.id.slice(0, 12)}…
                  </span>
                  <h2 className="text-2xl font-serif leading-tight">{item.title}</h2>
                  <p className="text-sm opacity-50">提交于：{formatSubmissionDate(item.submittedAt)}</p>
                  <p className="text-[10px] text-on-surface-variant/70">浓度：{item.soupType}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <div className={`font-serif text-lg italic ${submissionStatusClass(item.status)}`}>
                    {submissionStatusLabel(item.status)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-surface/95 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`relative ${SHELL_INNER} bg-surface-low border border-outline-variant/20 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`}
            >
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-widest text-primary/60">投稿详情</span>
                    <h2 className="text-3xl font-serif text-on-surface break-words">{selectedItem.title}</h2>
                  </div>
                  <div
                    className={`px-3 py-1 text-xs font-bold tracking-widest shrink-0 ${submissionBadgeClass(selectedItem.status)}`}
                  >
                    {submissionStatusLabel(selectedItem.status)}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-widest text-primary/40">汤面 (Surface)</h4>
                    <p className="font-serif text-lg leading-relaxed italic text-on-surface-variant">
                      “{selectedItem.surface}”
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-widest text-primary/40">汤底 (Base)</h4>
                    <p className="font-serif text-base leading-relaxed text-on-surface whitespace-pre-wrap">{selectedItem.bottom}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="w-full py-4 bg-surface-high text-on-surface font-bold tracking-widest uppercase text-xs hover:bg-surface-highest transition-colors"
                >
                  关闭详情
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState<View>('home');
  const [lastView, setLastView] = useState<View>('home');
  const [selectedRiddle, setSelectedRiddle] = useState<Riddle | null>(null);
  const [currentRiddle, setCurrentRiddle] = useState<Riddle | null>(null);
  const [progressEpoch, setProgressEpoch] = useState(0);
  const progressMap = useMemo(() => getProgress(), [progressEpoch]);
  const [publishedExtra, setPublishedExtra] = useState<Riddle[]>([]);

  const riddlePool = useMemo(() => mergeRiddlePools(riddles, publishedExtra), [publishedExtra]);

  useEffect(() => subscribeProgress(() => setProgressEpoch((n) => n + 1)), []);

  useEffect(() => {
    if (!canUseRemoteApi()) {
      setPublishedExtra([]);
      return;
    }
    let cancelled = false;
    fetch(apiUrl('/api/riddles-published'))
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return;
        if (!Array.isArray(data)) {
          setPublishedExtra([]);
          return;
        }
        setPublishedExtra(data as Riddle[]);
      })
      .catch(() => {
        if (!cancelled) setPublishedExtra([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [settlement, setSettlement] = useState<{
    success: boolean;
    count: number;
    maxQuestionLimit: number;
    elapsedMs: number;
    bottomText: string;
    finishReason: FinishReason;
    riddleId: string;
  } | null>(null);

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const pendingNavAfterLoginRef = useRef<View | null>(null);

  useEffect(() => {
    if (!isSupabaseBrowserConfigured()) return undefined;
    let cancelled = false;
    const sb = getSupabaseBrowser();

    const applySession = (session: import('@supabase/supabase-js').Session | null) => {
      if (cancelled) return;
      if (session?.user) {
        setAuthEmail(session.user.email ?? null);
        setCozeRuntimeUserIdFromSupabase(session.user.id);
        const pending = pendingNavAfterLoginRef.current;
        if (pending) {
          setView(pending);
          pendingNavAfterLoginRef.current = null;
          setLoginModalOpen(false);
        }
      } else {
        setAuthEmail(null);
        if (!getWechatAccessToken()) {
          clearCozeRuntimeUserId();
        }
      }
    };

    sb.auth.getSession().then(({ data }) => applySession(data.session));
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const ensureAuthOrPrompt = useCallback(async (pendingAfterLogin: View | null): Promise<boolean> => {
    if (getWechatAccessToken()) return true;
    if (!isSupabaseBrowserConfigured()) {
      pendingNavAfterLoginRef.current = pendingAfterLogin;
      setLoginModalOpen(true);
      return false;
    }
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (data.session) return true;
    } catch {
      /* fallthrough */
    }
    pendingNavAfterLoginRef.current = pendingAfterLogin;
    setLoginModalOpen(true);
    return false;
  }, []);

  const navigateTo = useCallback(
    async (v: View) => {
      if (v === 'developing' || v === 'submit' || v === 'history' || v === 'rules') {
        setLastView(view);
      }
      if (v === 'submit') {
        if (await ensureAuthOrPrompt('submit')) setView('submit');
        return;
      }
      if (v === 'history') {
        if (await ensureAuthOrPrompt('history')) setView('history');
        return;
      }
      setView(v);
    },
    [view, ensureAuthOrPrompt],
  );

  const handleProfileLoginPrompt = useCallback(() => {
    pendingNavAfterLoginRef.current = null;
    setLoginModalOpen(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await clearAuthSession();
    setAuthEmail(null);
  }, []);

  const handleSelectRiddle = (r: Riddle) => {
    setSelectedRiddle(r);
  };

  const handleStartGame = () => {
    if (selectedRiddle) {
      setCurrentRiddle(selectedRiddle);
      setSelectedRiddle(null);
      setView('game');
    }
  };

  const handleFinishGame = (payload: GameFinishPayload) => {
    recordGameEnd({ riddleId: payload.riddleId, cleared: payload.success });
    setSettlement({
      success: payload.success,
      count: payload.count,
      maxQuestionLimit: payload.maxQuestionLimit,
      elapsedMs: payload.elapsedMs,
      bottomText: payload.bottomText,
      finishReason: payload.finishReason,
      riddleId: payload.riddleId,
    });
  };

  const handleHome = () => {
    setSettlement(null);
    setCurrentRiddle(null);
    setView('home');
  };

  return (
    <div className="bg-surface min-h-screen selection:bg-primary selection:text-surface">
      <AnimatePresence mode="wait">
        {currentRiddle && (view === 'game' || view === 'rules') ? (
          <motion.div key="game-session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* 规则页叠在对局之上，避免卸载 GameRoomView 导致消息与回合进度丢失 */}
            <div className={view === 'rules' ? 'hidden' : undefined} aria-hidden={view === 'rules'}>
              <GameRoomView
                riddle={currentRiddle}
                onBack={() => setView('home')}
                onFinish={handleFinishGame}
                onShowRules={() => setView('rules')}
              />
            </div>
            {view === 'rules' && (
              <div className="fixed inset-0 z-[200] overflow-y-auto bg-surface">
                <RulesView onBack={() => setView('game')} />
              </div>
            )}
          </motion.div>
        ) : view === 'history' ? (
          <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HistoryView
              onBack={() => setView('profile')}
              onGoSubmit={() => void navigateTo('submit')}
            />
          </motion.div>
        ) : view === 'submit' ? (
          <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SubmitView
              onBack={() => setView('profile')}
              onSubmitted={() => setView('history')}
            />
          </motion.div>
        ) : (
          <motion.div key="layout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Layout activeTab={view} onTabChange={navigateTo} userLabel={authEmail ?? '未登录'}>
              {view === 'home' && (
                <HomeView
                  onSelectRiddle={handleSelectRiddle}
                  progressMap={progressMap}
                  riddlePool={riddlePool}
                />
              )}
              {view === 'profile' && (
                <ProfileView
                  onNavigate={navigateTo}
                  userEmail={authEmail}
                  onLogout={handleLogout}
                  onRequestLogin={handleProfileLoginPrompt}
                />
              )}
              {view === 'developing' && <DevelopingView onBack={() => setView(lastView)} showBack={false} />}
              {view === 'rules' && <ShellGameplayGuide onBack={() => setView(lastView)} />}
            </Layout>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRiddle && (
          <PuzzleDetailModal 
            riddle={selectedRiddle} 
            onClose={() => setSelectedRiddle(null)} 
            onStart={handleStartGame}
          />
        )}
        {settlement && (
          <SettlementView 
            success={settlement.success} 
            count={settlement.count} 
            maxQuestionLimit={settlement.maxQuestionLimit}
            elapsedMs={settlement.elapsedMs}
            bottomText={settlement.bottomText}
            finishReason={settlement.finishReason}
            onHome={handleHome} 
          />
        )}
      </AnimatePresence>

      <LoginModal
        open={loginModalOpen}
        onClose={() => {
          pendingNavAfterLoginRef.current = null;
          setLoginModalOpen(false);
        }}
      />
    </div>
  );
}
