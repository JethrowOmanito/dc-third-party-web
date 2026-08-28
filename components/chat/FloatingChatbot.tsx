'use client';
import { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, X, Send, Sparkles, 
  Bot, User, ChevronRight, Loader2,
  Calendar, CreditCard, ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Message {
  id: string;
  text: string;
  sender: 'bot' | 'user';
  timestamp: Date;
}

const INITIAL_MESSAGE: Message = {
  id: '1',
  text: 'Hello! I am your Doctor Clean Assistant. I have been updated with our official service scopes for Renovation and Tenancy cleaning. How can I help you today?',
  sender: 'bot',
  timestamp: new Date(),
};

const SUGGESTIONS = [
  { text: 'Renovation Scope', icon: Sparkles },
  { text: 'Check pricing', icon: CreditCard },
  { text: 'Operating Hours', icon: Calendar },
  { text: 'What is provided?', icon: ShieldCheck },
];

export function FloatingChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate AI thinking
    setTimeout(() => {
      let botResponse = '';
      const query = text.toLowerCase();

      if (query.includes('scope') || query.includes('reno') || query.includes('tenancy') || query.includes('area')) {
        botResponse = 'Our standard Renovation & Tenancy cleaning includes: \n' +
          '1. Ceiling fans\n2. Empty cabinets (int/ext)\n3. All fixtures\n4. Windows (reachable)\n5. Floor skirtings\n6. Balcony\n7. Doors & frames\n8. Toilet chemical wash\n9. Kitchen degreasing (hood/stove/fridge/oven)\n10. Floors (vacuum/mop)\n11. Store room\n12. Service yard.\n\nAll areas are inclusive in our standard NETT rates!';
      } else if (query.includes('price') || query.includes('cost')) {
        botResponse = 'Our General Housekeeping starts at $23-$28/hr. For Renovation or Deep Cleaning, rates are based on room type and sqft. You can get an automated quote in the "New Booking" page for most units!';
      } else if (query.includes('provided') || query.includes('solution') || query.includes('equipment')) {
        botResponse = 'Doctor Clean provides all cleaning equipment and professional solutions! You don’t need to worry about anything.';
      } else if (query.includes('available') || query.includes('time') || query.includes('hour')) {
        botResponse = 'We operate daily from 9:00 AM to 9:00 PM. Note that our first slot at 9:00 AM has no buffer, while subsequent sessions involve a 1-hour travel gap for our cleaners.';
      } else {
        botResponse = "I'm still learning our detailed SOPs, but I can tell you that we offer premium, NETT pricing for all services. Would you like to check our Renovation scope or book a session?";
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: botResponse,
        sender: 'bot',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="fixed right-4 lg:right-6 z-[100] flex flex-col items-end gap-4 pointer-events-none bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6">
      {/* Chat Window */}
      {isOpen && (
        <div className="pointer-events-auto w-[calc(100vw-2rem)] max-w-[380px] h-[min(520px,calc(100vh-9rem))] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
          {/* Header */}
          <div className="bg-emerald-600 p-4 pt-6 text-white relative">
            <div className="absolute top-0 right-0 p-3 flex gap-2">
               <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1.5 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
               </button>
            </div>
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center border border-white/30 backdrop-blur-md">
                  <Bot className="w-6 h-6 text-white" />
               </div>
               <div>
                  <p className="text-sm font-black tracking-tight leading-none uppercase">Doctor Clean AI</p>
                  <p className="text-[10px] text-emerald-100 font-medium mt-1">Status: Online & Ready</p>
               </div>
            </div>
            <div className="absolute bottom-0 right-0 p-4 opacity-10">
               <Sparkles className="w-16 h-16" />
            </div>
          </div>

          {/* Messages Area */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar"
          >
            {messages.map((m) => (
              <div key={m.id} className={cn("flex w-full", m.sender === 'user' ? "justify-end" : "justify-start")}>
                 <div className={cn(
                   "max-w-[80%] p-3 rounded-2xl text-xs font-medium shadow-sm",
                   m.sender === 'user' 
                     ? "bg-emerald-600 text-white rounded-tr-none" 
                     : "bg-white border border-slate-100 text-slate-700 rounded-tl-none"
                 )}>
                   {m.text}
                 </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                 <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                    <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" />
                    <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                 </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-100">
            {messages.length < 3 && !isTyping && (
                <div className="flex flex-wrap gap-2 mb-4 animate-in fade-in duration-700">
                    {SUGGESTIONS.map(s => (
                        <button 
                            key={s.text}
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
                onKeyDown={e => e.key === 'Enter' && handleSend(input)}
                placeholder="Ask me anything..." 
                className="pr-12 bg-slate-50 border-none rounded-xl h-11 text-xs focus-visible:ring-emerald-500"
              />
              <button 
                onClick={() => handleSend(input)}
                className="absolute right-2 p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors active:scale-90"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[8px] text-center text-slate-400 mt-2 font-medium">Doctor Clean Intelligence Engine v1.0</p>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="pointer-events-auto w-14 h-14 bg-emerald-600 rounded-2xl shadow-xl hover:shadow-emerald-500/20 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center group border-2 border-white/20"
      >
        <div className="relative">
           {isOpen ? <X className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
           {!isOpen && (
             <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse" />
           )}
        </div>
        
        {/* Tooltip */}
        {!isOpen && (
          <div className="absolute right-full mr-4 px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:block">
            Doctor Clean Help
          </div>
        )}
      </button>
    </div>
  );
}
