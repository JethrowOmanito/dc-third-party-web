'use client';
import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { usePathname } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  X, Send, Sparkles,
  Calendar, CreditCard, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

// Suggestions surfaced on the empty chat — partner-facing prompts,
// not customer prompts (that's Clara on booking-web).
const SUGGESTIONS = [
  { text: 'How do I create a booking?',        icon: Sparkles },
  { text: 'Cancel or reschedule policy',       icon: Calendar },
  { text: 'How is my rebate calculated?',      icon: CreditCard },
  { text: 'How do I add a team member?',       icon: ShieldCheck },
];

// Extract plain text from an AI SDK v6 UI message. Each message has a
// `parts` array of typed segments (text / tool-call / etc.) — for MVP we
// only render text parts and ignore anything else.
type UIMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'data';
  parts?: Array<{ type: string; text?: string }>;
};
function textOf(m: UIMessage): string {
  if (!Array.isArray(m.parts)) return '';
  return m.parts
    .filter(p => p?.type === 'text' && typeof p.text === 'string')
    .map(p => p.text as string)
    .join('');
}

// Tiny inline markdown renderer — handles what Clara actually emits
// (**bold**) without pulling in react-markdown. Splits on the **…**
// pattern, wraps every OTHER segment in <strong>. Newlines + bullets
// pass through as-is because the message bubble uses whitespace-pre-wrap.
// No dangerouslySetInnerHTML → no XSS surface even if the model tries.
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function FloatingChatbot() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // The booking wizard has its own compact chat trigger inside the mobile
  // navigation tray. Hide the floating FAB there so it doesn't overlap.
  const hideFabOnMobile = pathname === '/dashboard/booking/new';

  // AI SDK v6 useChat with DefaultChatTransport. Transport is memoised so
  // the hook doesn't recreate its internal fetch on every render.
  const chatTransport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat/ai' }),
    [],
  );
  const {
    messages, sendMessage, status, error, setMessages,
  } = useChat({
    transport: chatTransport,
    // Seed with a greeting so the panel isn't empty on first open. The
    // server's system prompt asks the model to greet — but that greeting
    // only fires once the user sends their first message. Local seed
    // gives them something to read + suggestion chips to click.
    messages: [
      {
        id: 'greeting',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi! I am Clara, your Virtual Assistant. How can I help?' }],
      },
    ],
  }) as {
    messages: UIMessage[];
    sendMessage: (m: { text: string }) => void;
    status: 'ready' | 'submitted' | 'streaming' | 'error';
    error?: Error | null;
    setMessages: (fn: (prev: UIMessage[]) => UIMessage[]) => void;
  };

  const isAiLoading = status === 'streaming' || status === 'submitted';

  // Auto-scroll to newest as messages / streaming progresses.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isAiLoading]);

  // External trigger — the booking wizard dispatches this event so its
  // inline chat button opens the same chat surface without duplicating
  // component state.
  useEffect(() => {
    const onOpen = () => setIsOpen(true);
    window.addEventListener('dc-open-chat', onOpen);
    return () => window.removeEventListener('dc-open-chat', onOpen);
  }, []);

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isAiLoading) return;
    sendMessage({ text: trimmed });
    setInput('');
  };

  const nonGreetingCount = messages.filter(m => m.id !== 'greeting').length;

  return (
    <div
      className={cn(
        'z-[100] pointer-events-none',
        // Full-screen container on mobile when open so Clara can fill
        // the viewport; on sm+ we anchor to the bottom-right corner as
        // a floating widget.
        isOpen
          ? 'fixed inset-0 sm:inset-auto sm:right-4 lg:right-6 sm:bottom-6 sm:top-auto sm:left-auto flex flex-col sm:items-end sm:gap-4'
          : 'fixed right-4 lg:right-6 flex flex-col items-end gap-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6',
      )}
    >
      {/* Chat Window — full-screen on mobile, floating card on sm+ */}
      {isOpen && (
        <div className="pointer-events-auto w-full h-full sm:w-[calc(100vw-2rem)] sm:max-w-[380px] sm:h-[min(560px,calc(100vh-9rem))] bg-white sm:rounded-3xl shadow-2xl border-0 sm:border sm:border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
          {/* Header */}
          <div className="bg-emerald-600 p-4 pt-6 text-white relative">
            <div className="absolute top-0 right-0 p-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMessages(() => [
                    {
                      id: 'greeting',
                      role: 'assistant',
                      parts: [{ type: 'text', text: 'Hi, I am your Doctor Clean AI Assistant. How can I help?' }],
                    },
                  ]);
                }}
                className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md hover:bg-white/20 transition-colors"
                title="Clear conversation"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-1.5 rounded-lg transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/40 bg-white flex items-center justify-center flex-shrink-0">
                <img src="/agent-avatar.png" alt="Clara" className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight leading-none">Clara</p>
                <p className="text-[10px] text-emerald-100 font-medium mt-1">Virtual Assistant</p>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 p-4 opacity-10">
              <Sparkles className="w-16 h-16" />
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar">
            {messages.map(m => {
              const text = textOf(m);
              if (!text) return null;
              const isUser = m.role === 'user';
              return (
                <div key={m.id} className={cn('flex w-full items-start gap-2', isUser ? 'justify-end' : 'justify-start')}>
                  {!isUser && (
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-white ring-1 ring-slate-200 flex-shrink-0 mt-0.5">
                      <img src="/agent-avatar.png" alt="Clara" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[80%] p-3 rounded-2xl text-xs font-medium shadow-sm whitespace-pre-wrap break-words',
                      isUser
                        ? 'bg-emerald-600 text-white rounded-tr-none'
                        : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none',
                    )}
                  >
                    {isUser ? text : renderMarkdown(text)}
                  </div>
                </div>
              );
            })}
            {isAiLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                  <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" />
                  <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-start">
                <div className="max-w-[80%] p-3 rounded-2xl rounded-tl-none text-xs font-medium bg-red-50 border border-red-100 text-red-700">
                  {error.message?.includes('rate limit')
                    ? 'Chat rate limit reached — please wait a bit.'
                    : error.message?.includes('Unauthorized') || error.message?.includes('Session expired')
                      ? 'Your session expired. Please refresh and log in again.'
                      : 'Something went wrong. Please try again in a moment.'}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-slate-100">
            {nonGreetingCount === 0 && !isAiLoading && (
              <div className="flex flex-wrap gap-2 mb-4 animate-in fade-in duration-700">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => handleSend(s.text)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <s.icon className="w-3 h-3" />
                    {s.text}
                  </button>
                ))}
              </div>
            )}
            <div className="relative flex items-center">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(input);
                  }
                }}
                placeholder={isAiLoading ? 'Thinking…' : 'Ask me anything…'}
                disabled={isAiLoading}
                className="pr-12 bg-slate-50 border-none rounded-xl h-11 text-xs focus-visible:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleSend(input)}
                disabled={isAiLoading || !input.trim()}
                className="absolute right-2 p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[8px] text-center text-slate-400 mt-2 font-medium">
              AI-generated — verify anything important. For pricing use New Booking.
            </p>
          </div>
        </div>
      )}

      {/* Floating Button — shows Clara's avatar so partners recognise
          the same face they'd see on booking-web. Under the hood the
          system prompt is partner-context (Clara knows partner-specific
          pricing rules etc. — see app/api/chat/ai/route.ts), but the
          identity/branding is unified. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close chat' : 'Open chat with Clara'}
        className={cn(
          'pointer-events-auto w-14 h-14 rounded-full shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center group ring-2 ring-white overflow-hidden',
          isOpen ? 'bg-emerald-600' : 'bg-white',
          // On mobile when Clara is open she covers the screen — hide
          // the FAB there, the header X button handles close. On sm+
          // she's a floating card, so the FAB stays visible for close.
          isOpen && 'hidden sm:flex',
          hideFabOnMobile && !isOpen && 'hidden lg:flex',
        )}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <img src="/agent-avatar.png" alt="Clara" className="w-full h-full object-cover" />
        )}
        {!isOpen && (
          <>
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse" />
            <div className="absolute right-full mr-4 px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:block">
              Ask Clara
            </div>
          </>
        )}
      </button>
    </div>
  );
}
