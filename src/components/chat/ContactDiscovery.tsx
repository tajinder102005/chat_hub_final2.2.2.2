import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, MessageCircle, UserPlus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import type { Profile } from '@/hooks/useProfile';

interface SavedContact {
  id: string;
  owner_id: string;
  contact_user_id: string;
  nickname: string | null;
  profile?: Profile;
}

interface Props {
  onBack: () => void;
  onStartChat: (conversationId: string, otherUserId: string) => void;
}

export default function ContactDiscovery({ onBack, onStartChat }: Props) {
  const { user } = useAuth();

  // Add contact dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResult, setAddResult] = useState<Profile | null>(null);
  const [addSearching, setAddSearching] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Saved contacts list
  const [savedContacts, setSavedContacts] = useState<SavedContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [startingChat, setStartingChat] = useState<string | null>(null);

  const fetchSavedContacts = useCallback(async () => {
    if (!user) return;
    setLoadingContacts(true);
    const { data } = await (supabase as any)
      .from('saved_contacts')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (!data) { setLoadingContacts(false); return; }

    const withProfiles: SavedContact[] = [];
    for (const c of data) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', c.contact_user_id)
        .maybeSingle();
      withProfiles.push({ ...c, profile: prof as Profile });
    }
    setSavedContacts(withProfiles);
    setLoadingContacts(false);
  }, [user]);

  useEffect(() => { fetchSavedContacts(); }, [fetchSavedContacts]);

  // Search by email OR phone — tries both fields
  const handleFindUser = async () => {
    const q = addQuery.trim();
    if (!q || !user) return;
    setAddSearching(true);
    setAddResult(null);
    setNotFound(false);

    // Try exact email match first
    let found: Profile | null = null;

    const { data: byEmail, error: emailErr } = await supabase
      .from('profiles')
      .select('*')
      .neq('user_id', user.id)
      .ilike('email', q)
      .maybeSingle();

    console.log('byEmail result:', byEmail, 'error:', emailErr);

    if (byEmail) {
      found = byEmail as Profile;
    } else {
      // fallback: phone
      const { data: byPhone } = await supabase
        .from('profiles')
        .select('*')
        .neq('user_id', user.id)
        .ilike('phone', q)
        .maybeSingle();
      if (byPhone) found = byPhone as Profile;
    }

    // last resort: partial match on email
    if (!found) {
      const { data: partial } = await supabase
        .from('profiles')
        .select('*')
        .neq('user_id', user.id)
        .ilike('email', `%${q}%`)
        .limit(1)
        .maybeSingle();
      if (partial) found = partial as Profile;
    }

    console.log('final found:', found);

    if (found) {
      setAddResult(found);
      setNickname(found.display_name || '');
    } else {
      setNotFound(true);
    }
    setAddSearching(false);
  };

  const handleSaveContact = async () => {
    if (!user || !addResult) return;
    setSaving(true);
    const { error } = await (supabase as any).from('saved_contacts').upsert({
      owner_id: user.id,
      contact_user_id: addResult.user_id,
      nickname: nickname.trim() || addResult.display_name || addResult.email,
    }, { onConflict: 'owner_id,contact_user_id' });

    if (error) {
      toast.error('Failed to save contact');
    } else {
      toast.success('Contact saved!');
      closeAddDialog();
      fetchSavedContacts();
    }
    setSaving(false);
  };

  const closeAddDialog = () => {
    setAddOpen(false);
    setAddQuery('');
    setAddResult(null);
    setNickname('');
    setNotFound(false);
  };

  const handleDeleteContact = async (id: string) => {
    await (supabase as any).from('saved_contacts').delete().eq('id', id);
    setSavedContacts(prev => prev.filter(c => c.id !== id));
    toast.success('Contact removed');
  };

  const startConversation = async (otherUserId: string) => {
    if (!user) return;
    setStartingChat(otherUserId);
    const [u1, u2] = [user.id, otherUserId].sort();

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('user1_id', u1)
      .eq('user2_id', u2)
      .maybeSingle();

    if (existing) {
      onStartChat(existing.id, otherUserId);
      setStartingChat(null);
      return;
    }

    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({ user1_id: u1, user2_id: u2 })
      .select('id')
      .single();

    setStartingChat(null);
    if (error) { toast.error('Failed to start conversation'); return; }
    onStartChat(newConv.id, otherUserId);
  };

  const initials = (n: string | null) =>
    n ? n.split(' ').map(s => s[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">Contacts</h2>
        <div className="ml-auto">
          <Button size="sm" className="gap-2" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Contact
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-lg space-y-3">
          {loadingContacts ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : savedContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm font-medium">No contacts yet</p>
              <p className="text-xs text-muted-foreground">
                Click "Add Contact" and enter someone's email or phone number to get started
              </p>
              <Button size="sm" className="gap-2 mt-2" onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4" /> Add Contact
              </Button>
            </div>
          ) : (
            savedContacts.map(c => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="flex items-center gap-3 p-3 border-0 bg-accent/30">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={c.profile?.avatar_url || ''} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {initials(c.nickname || c.profile?.display_name || c.profile?.email || null)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.nickname || c.profile?.display_name || c.profile?.email || 'Unknown'}
                    </p>
                    {(c.nickname || c.profile?.display_name) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {c.profile?.email || c.profile?.phone || ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8"
                      disabled={startingChat === c.contact_user_id}
                      onClick={() => startConversation(c.contact_user_id)}
                      title="Start chat"
                    >
                      {startingChat === c.contact_user_id
                        ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        : <MessageCircle className="h-4 w-4" />
                      }
                    </Button>
                    <Button
                      size="icon" variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteContact(c.id)}
                      title="Remove contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Add Contact Dialog */}
      <Dialog open={addOpen} onOpenChange={open => { if (!open) closeAddDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Step 1: find user */}
            <div className="space-y-1.5">
              <Label>Email or Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  value={addQuery}
                  onChange={e => { setAddQuery(e.target.value); setAddResult(null); setNotFound(false); }}
                  placeholder="e.g. john@email.com or +1234567890"
                  onKeyDown={e => e.key === 'Enter' && handleFindUser()}
                  autoFocus
                />
                <Button onClick={handleFindUser} disabled={addSearching || !addQuery.trim()} size="sm">
                  {addSearching ? '...' : 'Find'}
                </Button>
              </div>
              {notFound && (
                <p className="text-xs text-destructive">
                  No user found with that email or phone. Make sure they've registered and added their phone in their profile.
                </p>
              )}
            </div>

            {/* Step 2: found — set nickname and save */}
            {addResult && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/40">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={addResult.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {initials(addResult.display_name || addResult.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{addResult.display_name || 'No name set'}</p>
                    <p className="text-xs text-muted-foreground truncate">{addResult.email}</p>
                    {addResult.phone && <p className="text-xs text-muted-foreground">{addResult.phone}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Save as (optional nickname)</Label>
                  <Input
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder={addResult.display_name || 'Enter a nickname'}
                    onKeyDown={e => e.key === 'Enter' && handleSaveContact()}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline" className="flex-1"
                    onClick={() => { handleSaveContact().then(() => startConversation(addResult.user_id)); }}
                    disabled={saving}
                  >
                    Save & Chat
                  </Button>
                  <Button className="flex-1" onClick={handleSaveContact} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Contact'}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
