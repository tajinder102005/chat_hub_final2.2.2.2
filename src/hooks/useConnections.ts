import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface Connection {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
}

export function useConnections() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<string>(`connections-rt-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const fetchConnections = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('connections')
      .select('*')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    setConnections((data || []) as Connection[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchConnections();

    if (!user) return;
    const channelName = channelRef.current;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
        fetchConnections();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchConnections]);

  const sendRequest = async (addresseeId: string) => {
    if (!user) return;
    const { error } = await supabase.from('connections').insert({
      requester_id: user.id,
      addressee_id: addresseeId,
    });
    if (error) {
      if (error.code === '23505') toast.error('Connection request already sent');
      else toast.error('Failed to send request');
    } else {
      toast.success('Connection request sent!');
      fetchConnections();
    }
  };

  const acceptRequest = async (connectionId: string) => {
    await supabase.from('connections').update({ status: 'accepted' }).eq('id', connectionId);
    fetchConnections();
  };

  const blockConnection = async (connectionId: string) => {
    await supabase.from('connections').update({ status: 'blocked' }).eq('id', connectionId);
    fetchConnections();
  };

  const removeConnection = async (connectionId: string) => {
    await supabase.from('connections').delete().eq('id', connectionId);
    fetchConnections();
  };

  const acceptedContacts = connections.filter(c => c.status === 'accepted');
  const pendingIncoming = connections.filter(c => c.status === 'pending' && c.addressee_id === user?.id);
  const pendingOutgoing = connections.filter(c => c.status === 'pending' && c.requester_id === user?.id);

  return {
    connections, loading, sendRequest, acceptRequest, blockConnection, removeConnection,
    acceptedContacts, pendingIncoming, pendingOutgoing, fetchConnections,
  };
}
