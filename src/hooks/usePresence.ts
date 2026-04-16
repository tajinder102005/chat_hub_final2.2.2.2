import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function usePresence() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!user) return;

    // Set online
    supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('user_id', user.id).then(() => {});

    // Heartbeat every 30s
    intervalRef.current = setInterval(() => {
      supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('user_id', user.id).then(() => {});
    }, 30000);

    // Set offline on unload
    const handleUnload = () => {
      navigator.sendBeacon && supabase.from('profiles').update({ status: 'offline' }).eq('user_id', user.id);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener('beforeunload', handleUnload);
      supabase.from('profiles').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('user_id', user.id).then(() => {});
    };
  }, [user]);
}
