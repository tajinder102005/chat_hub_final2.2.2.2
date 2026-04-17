import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

export default function JoinGroup() {
  const { code } = useParams<{ code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'joining' | 'success' | 'error' | 'idle'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Save invite code and redirect to login
      sessionStorage.setItem('pendingInvite', code || '');
      navigate('/login');
      return;
    }
    joinGroup();
  }, [user, loading]);

  const joinGroup = async () => {
    if (!code) return;
    setStatus('joining');
    const { data: groupId, error } = await supabase.rpc('join_group_by_invite' as any, { code });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('success');
      setTimeout(() => navigate('/chat'), 1500);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20">
          <MessageCircle className="h-8 w-8 text-blue-500" />
        </div>
        <h1 className="text-2xl font-bold">ChatHub</h1>
        {status === 'idle' || status === 'joining' ? (
          <>
            <p className="text-muted-foreground">Joining group...</p>
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </>
        ) : status === 'success' ? (
          <>
            <p className="text-green-500 font-medium">Joined successfully!</p>
            <p className="text-sm text-muted-foreground">Redirecting to chat...</p>
          </>
        ) : (
          <>
            <p className="text-destructive font-medium">Failed to join</p>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => navigate('/chat')}>Go to Chat</Button>
          </>
        )}
      </div>
    </div>
  );
}
