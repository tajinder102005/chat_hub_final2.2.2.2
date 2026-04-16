import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, LogOut, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

interface Message {
  id: string;
  user_id: string;
  email: string;
  content: string;
  created_at: string;
}

export default function Chat() {
  const { user, loading, signOut } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch last 50 messages
  useEffect(() => {
    if (!user) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) {
        toast.error('Failed to load messages');
      } else {
        setMessages(data || []);
      }
      setLoadingMessages(false);
    };

    fetchMessages();
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    setSending(true);
    const { error } = await supabase.from('messages').insert({
      user_id: user.id,
      email: user.email || 'unknown',
      content: newMessage.trim(),
    });

    if (error) {
      toast.error('Failed to send message');
    } else {
      setNewMessage('');
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MessageCircle className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-bold text-foreground">ChatApp</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto px-4 py-4 md:px-6"
      >
        {loadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <MessageCircle className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">No messages yet</p>
            <p className="text-sm">Be the first to say something!</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            <AnimatePresence initial={false}>
              {messages.map((msg) => {
                const isOwn = msg.user_id === user.id;
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <Card
                      className={`max-w-[75%] border-0 px-4 py-2.5 shadow-sm ${
                        isOwn
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card text-card-foreground'
                      }`}
                    >
                      {!isOwn && (
                        <p className="mb-0.5 text-xs font-semibold text-primary">
                          {msg.email}
                        </p>
                      )}
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          isOwn
                            ? 'text-primary-foreground/60'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {format(new Date(msg.created_at), 'h:mm a')}
                      </p>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card px-4 py-3 md:px-6">
        <form
          onSubmit={handleSend}
          className="mx-auto flex max-w-3xl items-center gap-2"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="h-11 flex-1"
            disabled={sending}
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={sending || !newMessage.trim()}
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
