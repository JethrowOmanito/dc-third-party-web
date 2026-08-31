'use client';
import { useEffect, useState, useRef, use, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

export default function JobChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = getSupabaseClient();

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('event_chats')
      .select('*')
      .eq('event_id', jobId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (data) {
      setMessages(prev => {
        if (prev.length === data.length && prev[prev.length - 1]?.id === data[data.length - 1]?.id) {
          return prev;
        }
        return data as ChatMessage[];
      });
    }
    setLoading(false);
    setTimeout(scrollToBottom, 100);
  }, [jobId]);

  const markRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('event_chats')
      .update({ is_read: true })
      .eq('event_id', jobId)
      .eq('is_read', false)
      .neq('user_id', user.id);
  }, [jobId, user]);

  useEffect(() => {
    fetchMessages();
    markRead();

    const channel = supabase
      .channel(`chat-${jobId}`)
      .on('postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'event_chats', filter: `event_id=eq.${jobId}` },
        async (payload: any) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as ChatMessage];
          });
          setTimeout(scrollToBottom, 50);
          if (payload.new.user_id !== user?.id) {
            await supabase.from('event_chats').update({ is_read: true }).eq('id', payload.new.id);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        if (status === 'CLOSED') setRealtimeStatus('connecting');
        if (status === 'CHANNEL_ERROR') setRealtimeStatus('error');
      });

    const pollInterval = setInterval(() => {
      fetchMessages();
      markRead();
    }, 4000); // Relaxed polling as we have real-time

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [jobId, fetchMessages, markRead]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setInput('');
    try {
      // Server route stamps user_id + sender_role from the JWT and
      // checks event ownership. Previously this insert ran with the
      // anon key from the browser, letting anyone impersonate any user
      // in any event's chat thread.
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: jobId, message: text }),
      });
      if (!res.ok) throw new Error('send failed');
    } catch {
      setInput(text); // restore on error
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });

  const formatDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-SG', { weekday: 'short', month: 'short', day: 'numeric' });

  // Group messages by date
  const grouped: { date: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const day = msg.created_at?.split('T')[0] || '';
    const last = grouped[grouped.length - 1];
    if (last && last.date === day) {
      last.msgs.push(msg);
    } else {
      grouped.push({ date: day, msgs: [msg] });
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)] max-w-2xl mx-auto">
      {/* Header Info */}
      <div className="px-3 py-2 border-b border-gray-100 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            realtimeStatus === 'connected' ? "bg-emerald-500 animate-pulse" : 
            realtimeStatus === 'connecting' ? "bg-amber-400" : "bg-red-500"
          )} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            {realtimeStatus === 'connected' ? 'Live Connection' : 'Restoring Connection...'}
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          onClick={() => fetchMessages()}
        >
          Refresh
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 bg-gray-50/50">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400 text-sm">
            <p>No messages yet.</p>
            <p className="text-xs mt-1">Start the conversation!</p>
          </div>
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date}>
              <div className="flex items-center my-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="mx-3 text-[10px] text-gray-400 font-medium uppercase tracking-wider">{formatDay(date)}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              {msgs.map((msg) => {
                const isMine = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={cn('flex mb-2', isMine ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[80%] sm:max-w-[70%]', isMine ? 'items-end' : 'items-start', 'flex flex-col')}>
                      {!isMine && (
                        <span className="text-xs text-gray-500 mb-1 ml-1">{msg.user}</span>
                      )}
                      <div
                        className={cn(
                          'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                          isMine
                            ? 'bg-emerald-600 text-white rounded-tr-sm'
                            : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1 mx-1">
                        {formatTime(msg.created_at)}
                        {isMine && (
                          <span className="ml-1">{msg.is_read ? '✓✓' : '✓'}</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32 overflow-y-auto"
          style={{ minHeight: '42px' }}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          size="icon"
          className="flex-shrink-0 h-[42px] w-[42px]"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
