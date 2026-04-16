import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string;
  phone: string;
  email: string;
  status: 'online' | 'busy' | 'offline';
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      setProfile(data as Profile | null);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const updateProfile = async (updates: Partial<Pick<Profile, 'display_name' | 'bio' | 'phone' | 'avatar_url'>>) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single();
    if (!error && data) setProfile(data as Profile);
    return { data, error };
  };

  const updateStatus = async (status: 'online' | 'busy' | 'offline') => {
    if (!user) return;
    await supabase.from('profiles').update({ status, last_seen: new Date().toISOString() }).eq('user_id', user.id);
  };

  return { profile, loading, updateProfile, updateStatus };
}

export function useProfileById(userId: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('*').eq('user_id', userId).single().then(({ data }) => {
      setProfile(data as Profile | null);
    });
  }, [userId]);
  return profile;
}
