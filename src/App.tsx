import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Keyboard
} from 'lucide-react';
import {
  riddles,
  pickRandomRiddle,
  formatDifficultyLabel,
  riddleSummary,
  type Riddle,
} from './data/riddles';
import { askHost, type CozeConversationState } from './lib/cozeHost';
import { recordGameEnd, subscribeProgress, getProgress, type ProgressMap } from './lib/playerProgress';
import { isSpeechToTextSupported, startSpeechToText, stopSpeechToText } from './lib/speechToText';

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

type FinishReason = 'win' | 'give_up' | 'out_of_turns';

interface GameFinishPayload {
  success: boolean;
  count: number;
  elapsedMs: number;
  bottomText: string;
  finishReason: FinishReason;
  riddleId: string;
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

interface Message {
  id: string;
  role: 'user' | 'host';
  text: string;
}

// --- Components ---

const Layout = ({ children, activeTab, onTabChange }: { children: React.ReactNode, activeTab: View, onTabChange: (v: View) => void }) => {
  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-surface relative">
      <div className="flex-grow overflow-y-auto no-scrollbar pb-24">
        {children}
      </div>
      
      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex justify-around items-center h-20 bg-surface border-t-4 border-surface-high z-50">
        <button 
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-primary' : 'text-on-surface/40'}`}
        >
          <HomeNavIcon size={24} fill={activeTab === 'home' ? 'currentColor' : 'none'} />
          <span className="text-[10px] uppercase tracking-widest font-bold">海龟汤</span>
        </button>
        <button 
          onClick={() => onTabChange('developing')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'developing' ? 'text-primary' : 'text-on-surface/40'}`}
        >
          <TrendingUp size={24} />
          <span className="text-[10px] uppercase tracking-widest font-bold">每日一汤</span>
        </button>
        <button 
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-primary' : 'text-on-surface/40'}`}
        >
          <User size={24} fill={activeTab === 'profile' ? 'currentColor' : 'none'} />
          <span className="text-[10px] uppercase tracking-widest font-bold">个人中心</span>
        </button>
      </nav>
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

const HomeView = ({
  onSelectRiddle,
  progressMap,
}: {
  onSelectRiddle: (r: Riddle) => void;
  progressMap: ProgressMap;
}) => {
  const [bannerRiddle, setBannerRiddle] = useState<Riddle>(() => pickRandomRiddle());
  const [searchQuery, setSearchQuery] = useState('');
  const bannerProg = progressMap[bannerRiddle.id];

  const filteredRiddles = riddles.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.surface.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q)
    );
  });

  const handleRandomSoup = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBannerRiddle(pickRandomRiddle(bannerRiddle.id));
  };

  return (
    <div className="p-6 space-y-12">
      <header className="flex justify-between items-center py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-surface-high flex items-center justify-center overflow-hidden">
            <img 
              src="https://picsum.photos/seed/alchemist/100/100" 
              alt="Avatar" 
              className="w-full h-full object-cover grayscale contrast-125"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-xl font-bold text-primary tracking-widest uppercase font-serif">炼金术士的账本</h1>
        </div>
      </header>

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
        <div className="space-y-8">
          {filteredRiddles.length === 0 ? (
            <p className="text-sm text-on-surface-variant pl-1">没有匹配的汤，换个关键词试试。</p>
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
        className="relative w-full max-w-md bg-surface-low shadow-2xl ring-1 ring-outline-variant/30 flex flex-col overflow-hidden"
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
  const maxAttempts = 20;
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
    } else if (usedAttempts >= maxAttempts) {
      setTimeout(() => onFinish(buildFinish(false, usedAttempts, elapsedMs, 'out_of_turns')), 1500);
    }
  };

  const sttOk = isSpeechToTextSupported();

  const startHoldSpeech = () => {
    if (!sttOk) return;
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
      <header className="fixed top-0 w-full max-w-md flex justify-between items-center px-4 h-20 bg-surface border-b border-outline-variant/10 z-50">
        <div className="flex items-center gap-1">
          <button onClick={onBack} className="p-2 text-primary hover:bg-primary/10 transition-all">
            <ArrowLeft size={24} />
          </button>
        </div>
        <h1 className="text-2xl font-serif font-bold text-primary tracking-[0.3em]">{riddle.title}</h1>
        <div className="flex items-center gap-1">
          <button onClick={onShowRules} className="p-2 text-primary hover:bg-primary/10 transition-all">
            <HelpCircle size={24} />
          </button>
        </div>
      </header>

      <main className="pt-24 pb-36 flex-grow flex flex-col overflow-hidden">
        <div className="p-6">
          <div className="bg-surface-low p-8 relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-surface-highest rotate-12 opacity-40"></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <span className="text-[10px] tracking-widest text-on-surface-variant uppercase">案件编号 #{riddle.id}</span>
                <div className="flex items-center gap-2">
                  <HelpCircle size={14} className="text-secondary" />
                  <span className="text-xs font-bold text-secondary">{formatDifficultyLabel(riddle.difficulty)}</span>
                </div>
              </div>
              <div className="bg-surface-highest h-1 w-24 mb-6"></div>
              <p className="font-serif text-lg text-on-surface leading-relaxed">
                {riddle.surface}
              </p>
              <div className="mt-8 pt-4 border-t border-outline-variant/20">
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
                  className="mt-4 text-[10px] tracking-widest text-on-surface-variant hover:text-primary underline-offset-2 hover:underline disabled:opacity-40"
                >
                  放弃本局
                </button>
              </div>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-grow px-6 py-4 space-y-10 overflow-y-auto no-scrollbar">
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
      </main>

      <div className="fixed bottom-0 w-full max-w-md z-50 bg-surface border-t border-outline-variant/10 pt-2 pb-6 px-4 space-y-2">
        {isVoiceMode && !sttOk && (
          <p className="text-[10px] text-on-surface-variant leading-relaxed px-1">
            当前环境不支持浏览器语音识别（微信小游戏需单独接入）。请点左侧键盘图标改用文字输入。
          </p>
        )}
        {sttBanner && (
          <p className="text-[10px] text-primary px-1">{sttBanner}</p>
        )}
        {isVoiceMode && sttOk && (
          <p className="text-[10px] text-on-surface-variant px-1">按住麦克风说话，松开后识别为文字填入框内，再点发送。</p>
        )}
        <div className="flex items-center gap-3">
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
          <div className="flex-grow flex items-center bg-surface-low border border-outline-variant/30 shadow-2xl overflow-hidden min-h-[3rem]">
            {isVoiceMode ? (
              <div
                className="flex-grow flex flex-col items-stretch justify-center gap-2 py-2 px-2 min-h-[3rem]"
                onPointerLeave={sttOk ? endHoldSpeech : undefined}
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
                        speechListening && sttOk
                          ? { height: [8, 24, 12, 28, 10] }
                          : { height: 8 }
                      }
                      transition={{
                        repeat: speechListening && sttOk ? Infinity : 0,
                        duration: 0.8,
                        delay: i * 0.1,
                        ease: 'easeInOut',
                      }}
                      className="w-1 bg-primary/60 rounded-full"
                    />
                  ))}
                </div>
                {sttOk && (
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
  elapsedMs,
  bottomText,
  finishReason,
  onHome,
}: {
  success: boolean;
  count: number;
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/90 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-surface border border-outline-variant/30 relative overflow-hidden flex flex-col max-h-[90vh]"
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
              <span className="font-serif text-xl text-on-surface tracking-tighter">{count}/20</span>
            </div>
            <div className="bg-surface-low py-3 px-1 border-l border-secondary/20 flex flex-col items-center justify-center">
              <span className="text-[8px] uppercase tracking-widest text-on-surface-variant opacity-60">提示</span>
              <span className="font-serif text-xl text-secondary tracking-tighter">0</span>
            </div>
          </section>

          <footer className="flex flex-col gap-3 pt-4">
            <button className="bg-primary text-surface font-bold py-4 tracking-[0.2em] uppercase text-xs flex items-center justify-center gap-2 active:scale-95 transition-all">
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

const ProfileView = ({ onNavigate }: { onNavigate: (v: View) => void }) => {
  return (
    <div className="p-6 space-y-12">
      <section className="mt-12">
        <div className="bg-surface-low p-6 flex items-center gap-6">
          <div className="w-20 h-20 bg-surface-highest relative flex items-center justify-center overflow-hidden">
            <img 
              src="https://picsum.photos/seed/profile/200/200" 
              alt="Avatar" 
              className="w-full h-full object-cover grayscale opacity-80"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-2xl font-bold tracking-tight">炼金术士 #0812</h2>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-[11px] uppercase tracking-[0.2em] opacity-50 ml-2">投稿</h3>
        <div className="space-y-1">
          <button 
            onClick={() => onNavigate('submit')}
            className="w-full bg-surface-low p-5 flex items-center justify-between group hover:bg-surface-high transition-colors"
          >
            <span className="font-serif text-lg italic">提交谜题</span>
            <ChevronRight size={18} className="opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
          </button>
          <button 
            onClick={() => onNavigate('history')}
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
            onClick={() => onNavigate('developing')}
            className="w-full bg-surface-low p-5 flex items-center justify-between group hover:bg-surface-high transition-colors"
          >
            <span className="font-serif text-lg italic">游戏统计</span>
            <TrendingUp size={18} className="opacity-30 group-hover:opacity-100 transition-all" />
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

const RulesView = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="bg-surface min-h-screen">
      <header className="w-full sticky top-0 z-50 bg-surface border-b border-outline-variant/10">
        <nav className="flex items-center px-6 py-4">
          <button onClick={onBack} className="text-primary p-1">
            <ArrowLeft size={24} />
          </button>
          <div className="ml-auto text-on-surface-variant font-serif text-sm tracking-widest uppercase">The Alchemist’s Ledger</div>
        </nav>
      </header>
      <main className="max-w-2xl mx-auto px-8 pt-12 pb-24 space-y-20">
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
              每局游戏都有固定的提问次数上限，请谨慎珍惜每一次提问机会。你可以通过文字输入问题，也可以长按麦克风图标进行语音提问。
            </p>
            <p>
              如果你陷入了僵局，无法找到新的切入点，可以向汤主索要线索，但这将消耗一次提问机会。保持冷静，真相就在细节之中。
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

const SubmitView = ({ onBack }: { onBack: () => void }) => {
  const [selectedType, setSelectedType] = useState('清汤');

  return (
    <div className="p-6 space-y-12">
      <header className="flex items-center gap-4">
        <button onClick={onBack} className="text-primary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-on-surface tracking-widest uppercase font-serif">贡献新汤</h1>
      </header>
      
      <div className="space-y-8">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">谜题标题</label>
          <input 
            type="text" 
            placeholder="此处刻下名字..." 
            className="w-full bg-surface-low border border-outline-variant/30 p-4 font-serif text-lg focus:ring-1 focus:ring-primary/50"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">汤面描述</label>
          <textarea 
            rows={4}
            placeholder="写下那令人不寒而栗的开端..." 
            className="w-full bg-surface-low border border-outline-variant/30 p-4 font-serif text-base focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">汤底答案</label>
          <textarea 
            rows={4}
            placeholder="揭示背后隐藏的残酷真相..." 
            className="w-full bg-surface-low border border-outline-variant/30 p-4 font-serif text-base focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-widest text-primary/60">汤底浓度</label>
          <div className="grid grid-cols-3 gap-2">
            {['清汤', '红汤', '黑汤'].map(t => (
              <button 
                key={t} 
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

        <button className="w-full py-5 bg-primary text-surface font-bold tracking-[0.2em] uppercase text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all">
          封印并提交 <FileText size={18} />
        </button>
      </div>
    </div>
  );
};

const HistoryView = ({ onBack }: { onBack: () => void }) => {
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const submissions = [
    { 
      id: '802', 
      title: '被诅咒的午餐盒', 
      date: '2023.10.12', 
      status: '已收录',
      surface: '男人每天中午都会打开一个红色的午餐盒，但他从来不吃里面的东西。直到有一天，他把午餐盒扔进了大海。',
      base: '午餐盒里装的是他去世妻子的骨灰，他每天带在身边是为了陪伴。扔进大海是因为他终于决定放下过去。'
    },
    { 
      id: '819', 
      title: '深海里的敲击声', 
      date: '2023.11.04', 
      status: '审核中',
      surface: '潜水员在深海听到有节奏的敲击声，但他环顾四周，方圆百里只有他一个人。',
      base: '敲击声其实来自于他自己的氧气瓶，因为阀门松动在水流中撞击。'
    },
    { 
      id: '744', 
      title: '消失的红雨伞', 
      date: '2023.09.28', 
      status: '未通过',
      surface: '雨天，女孩撑着红雨伞走过街道，转角后雨伞消失了，女孩也消失了。',
      base: '这是一个魔术表演的意外，红雨伞是道具，女孩通过暗门离开了，但暗门卡住导致她被困。'
    }
  ];

  return (
    <div className="p-6 space-y-12 bg-surface min-h-screen">
      <header className="flex items-center gap-4">
        <button onClick={onBack} className="text-primary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-on-surface tracking-widest uppercase font-serif">投稿记录</h1>
      </header>

      <div className="space-y-0 border-y border-outline-variant/20">
        {submissions.map(item => (
          <div 
            key={item.id} 
            onClick={() => setSelectedItem(item)}
            className="group relative py-8 border-b border-outline-variant/10 hover:bg-surface-low transition-colors cursor-pointer"
          >
            <div className="flex justify-between items-end">
              <div className="space-y-2">
                <span className="text-[10px] text-primary/60 tracking-widest uppercase">词条 #{item.id}</span>
                <h2 className="text-2xl font-serif leading-tight">{item.title}</h2>
                <p className="text-sm opacity-50">提交于：{item.date}</p>
              </div>
              <div className="flex flex-col items-end">
                <div className={`font-serif text-lg italic ${item.status === '已收录' ? 'shimmer-gold font-bold' : item.status === '未通过' ? 'text-tertiary' : 'text-secondary'}`}>
                  {item.status}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

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
              className="relative w-full max-w-md bg-surface-low border border-outline-variant/20 shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-widest text-primary/60">投稿详情 #{selectedItem.id}</span>
                    <h2 className="text-3xl font-serif text-on-surface">{selectedItem.title}</h2>
                  </div>
                  <div className={`px-3 py-1 text-xs font-bold tracking-widest ${selectedItem.status === '已收录' ? 'bg-primary/20 text-primary' : selectedItem.status === '未通过' ? 'bg-tertiary/20 text-tertiary' : 'bg-secondary/20 text-secondary'}`}>
                    {selectedItem.status}
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
                    <p className="font-serif text-base leading-relaxed text-on-surface">
                      {selectedItem.base}
                    </p>
                  </div>
                </div>

                <button 
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

  useEffect(() => subscribeProgress(() => setProgressEpoch((n) => n + 1)), []);

  const [settlement, setSettlement] = useState<{
    success: boolean;
    count: number;
    elapsedMs: number;
    bottomText: string;
    finishReason: FinishReason;
    riddleId: string;
  } | null>(null);

  const handleNavigate = (v: View) => {
    if (v === 'developing' || v === 'submit' || v === 'history' || v === 'rules') {
      setLastView(view);
    }
    setView(v);
  };

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
        {(view === 'game' || view === 'rules') && currentRiddle ? (
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
            <HistoryView onBack={() => setView('profile')} />
          </motion.div>
        ) : view === 'submit' ? (
          <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SubmitView onBack={() => setView('profile')} />
          </motion.div>
        ) : (
          <motion.div key="layout" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Layout activeTab={view} onTabChange={handleNavigate}>
              {view === 'home' && (
                <HomeView onSelectRiddle={handleSelectRiddle} progressMap={progressMap} />
              )}
              {view === 'profile' && <ProfileView onNavigate={handleNavigate} />}
              {view === 'developing' && <DevelopingView onBack={() => setView(lastView)} showBack={false} />}
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
            elapsedMs={settlement.elapsedMs}
            bottomText={settlement.bottomText}
            finishReason={settlement.finishReason}
            onHome={handleHome} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
