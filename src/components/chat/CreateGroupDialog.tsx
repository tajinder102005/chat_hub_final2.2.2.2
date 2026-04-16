import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConnections } from '@/hooks/useConnections';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Plus, X, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { Profile } from '@/hooks/useProfile';

interface Props {
  onCreated: () => void;
}

export default function CreateGroupDialog({ onCreated }: Props) {
  const { user } = useAuth();
  const { acceptedContacts } = useConnections();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    setSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('user_id', user.id)
      .or(`email.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
      .limit(10);
    setSearchResults((data || []) as Profile[]);
    setSearching(false);
  };

  const toggleMember = (profile: Profile) => {
    if (selectedMembers.find(m => m.user_id === profile.user_id)) {
      setSelectedMembers(selectedMembers.filter(m => m.user_id !== profile.user_id));
    } else {
      setSelectedMembers([...selectedMembers, profile]);
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setCreating(true);

    // Create group
    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: name.trim(), created_by: user.id })
      .select('id')
      .single();

    if (error || !group) {
      console.error('Group creation error:', error);
      toast.error('Failed to create group: ' + (error?.message || 'unknown error'));
      setCreating(false);
      return;
    }

    // Add creator as admin
    const { error: adminError } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'admin',
    });
    if (adminError) {
      console.error('Add admin error:', adminError);
      toast.error('Failed to add you as admin: ' + adminError.message);
      setCreating(false);
      return;
    }

    // Add selected members
    if (selectedMembers.length > 0) {
      const membersToAdd = selectedMembers.map(m => ({
        group_id: group.id,
        user_id: m.user_id,
        role: 'member' as const,
      }));
      const { error: memberError } = await supabase.from('group_members').insert(membersToAdd);
      if (memberError) {
        toast.error('Group created but some members could not be added');
      }
    }

    toast.success('Group created successfully!');
    setName('');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMembers([]);
    setOpen(false);
    setCreating(false);
    onCreated();
  };

  const initials = (n: string | null) => n ? n.split(' ').map((s: string) => s[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full mb-2 gap-2">
          <Plus className="h-4 w-4" /> Create Group
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Group</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Group Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekend Plans" />
          </div>

          <div className="space-y-2">
            <Label>Add Members</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searching} size="sm">
                {searching ? '...' : 'Search'}
              </Button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Search Results</Label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {searchResults.map(p => {
                  const isSelected = selectedMembers.find(m => m.user_id === p.user_id);
                  return (
                    <button
                      key={p.user_id}
                      onClick={() => toggleMember(p)}
                      className={`flex items-center gap-2 w-full p-2 rounded-lg text-left transition-colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-accent/50 border border-transparent'
                        }`}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials(p.display_name || p.email)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm flex-1 truncate">{p.display_name || p.email}</span>
                      {isSelected && <Badge variant="secondary" className="text-[10px]">Added</Badge>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Members */}
          {selectedMembers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Selected Members ({selectedMembers.length})</Label>
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map(m => (
                  <Badge key={m.user_id} variant="secondary" className="gap-1">
                    {m.display_name || m.email}
                    <button onClick={() => toggleMember(m)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Quick add from contacts */}
          {acceptedContacts.length > 0 && searchResults.length === 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Add from Contacts</Label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {acceptedContacts.map(conn => {
                  const otherUserId = conn.requester_id === user?.id ? conn.addressee_id : conn.requester_id;
                  const isSelected = selectedMembers.find(m => m.user_id === otherUserId);
                  return (
                    <QuickAddContact
                      key={conn.id}
                      userId={otherUserId}
                      isSelected={isSelected}
                      onToggle={(profile) => toggleMember(profile)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <Button onClick={handleCreate} disabled={creating || !name.trim()} className="w-full">
            {creating ? 'Creating...' : 'Create Group'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddContact({ userId, isSelected, onToggle }: { userId: string; isSelected: boolean; onToggle: (profile: Profile) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('user_id', userId).single().then(({ data }) => setProfile(data as Profile));
  }, [userId]);

  if (!profile) return null;

  const initials = (n: string | null) => n ? n.split(' ').map((s: string) => s[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <button
      onClick={() => onToggle(profile)}
      className={`flex items-center gap-2 w-full p-2 rounded-lg text-left transition-colors ${isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-accent/50 border border-transparent'
        }`}
    >
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials(profile.display_name || profile.email)}</AvatarFallback>
      </Avatar>
      <span className="text-sm flex-1 truncate">{profile.display_name || profile.email}</span>
      {isSelected && <Badge variant="secondary" className="text-[10px]">Added</Badge>}
    </button>
  );
}
