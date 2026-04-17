import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ChatWith() {
  const { userId } = useParams<{ userId: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      sessionStorage.setItem('pendingChatWith', userId || '');
      navigate('/login');
      return;
    }
    if (user.id === userId) {
      navigate('/chat');
      return;
    }
    startChat();
  }, [user, loading]);

  const startChat = async () => {
    if (!user || !userId) return;
    const [u1, u2] = [user.id, userId].sort();

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user1_id', u1)
      .eq('user2_id', u2)
      .maybeSingle();

    if (existing) {
      navigate('/chat', { state: { openConversation: existing.id, otherUserId: userId } });
      return;
    }

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({ user1_id: u1, user2_id: u2 })
      .select('id')
      .single();

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }

    navigate('/chat', { state: { openConversation: newConv.id, otherUserId: userId } });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20">
          <MessageCircle className="h-8 w-8 text-blue-500" />
        </div>
        <h1 className="text-2xl font-bold">ChatHub</h1>
        {status === 'loading' && (
          <>
            <p className="text-muted-foreground">Opening chat...</p>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-destructive">{errorMsg}</p>
            <Button onClick={() => navigate('/chat')}>Go to Chat</Button>
          </>
        )}
      </div>
    </div>
  );
}
