'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { getSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

export default function JobChatContent({ jobId }: { jobId: string }) {
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
      setMessages(data as ChatMessage[]);
    }
    setLoading(false);
    setTimeout(scrollToBottom, 100);
  }, [jobId, supabase]);

  const markRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('event_chats')
      .update({ is_read: true })
      .eq('event_id', jobId)
      .eq('is_read', false)
      .neq('user_id', user.id);
  }, [jobId, user, supabase]);

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
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [jobId, fetchMessages, markRead, supabase, user?.id]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setInput('');
    try {
      await supabase.from('event_chats').insert({
        event_id: jobId,
        user: user.username || 'Guest',
        user_id: user.id,
        message: text,
        sender_role: 'thirdparty',
        is_read: false,
      });
    } catch {
      setInput(text);
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

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/30">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 opacity-50">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Loading History...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400 text-sm">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Send className="w-5 h-5 opacity-20" />
            </div>
            <p className="font-bold">No messages yet</p>
            <p className="text-xs mt-1">Our admin hasn't joined the chat yet.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%]', isMine ? 'items-end' : 'items-start', 'flex flex-col')}>
                  {!isMine && (
                    <span className="text-[9px] font-black text-slate-400 mb-1 ml-1 uppercase tracking-tight">{msg.user}</span>
                  )}
                  <div
                    className={cn(
                      'px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm',
                      isMine
                        ? 'bg-emerald-600 text-white rounded-tr-sm'
                        : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1">
                    <span className="text-[9px] text-slate-400 font-medium">{formatTime(msg.created_at)}</span>
                    {isMine && (
                       <span className="text-[9px] text-emerald-500 font-black">{msg.is_read ? 'READ' : 'SENT'}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100 flex items-end gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask us anything..."
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all max-h-32"
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="rounded-2xl w-12 h-12 p-0 flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg active:scale-95 transition-all"
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}
