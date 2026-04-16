import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConnections } from '@/hooks/useConnections';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatView } from '@/pages/ChatApp';
import CreateGroupDialog from '@/components/chat/CreateGroupDialog';
import {
  MessageCircle, Users, Search, UserPlus, Settings, LogOut,
} from 'lucide-react';

interface ConversationItem {
  conversation_id: string;
  other_user_id: string;
  other_display_name: string;
  other_avatar_url: string | null;
  other_status: string;
  last_message?: string;
  last_message_at?: string;
  unread_count: number;
}

interface GroupItem {
  id: string;
  name: string;
  icon_url: string | null;
}

interface Props {
  currentView: ChatView;
  onNavigate: (view: ChatView) => void;
}

export default function ChatSidebar({ currentView, onNavigate }: Props) {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { pendingIncoming } = useConnections();
  const [tab, setTab] = useState<'chats' | 'groups'>('chats');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [search, setSearch] = useState('');

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    if (!data) return;

    const items: ConversationItem[] = [];
    for (const conv of data) {
      const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, status')
        .eq('user_id', otherId)
        .maybeSingle();

      const { data: lastMsg } = await supabase
        .from('direct_messages')
        .select('content, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: unread } = await supabase
        .from('direct_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', user.id)
        .is('read_at', null);

      items.push({
        conversation_id: conv.id,
        other_user_id: otherId,
        other_display_name: prof?.display_name || 'Unknown',
        other_avatar_url: prof?.avatar_url || null,
        other_status: prof?.status || 'offline',
        last_message: lastMsg?.content,
        last_message_at: lastMsg?.created_at,
        unread_count: unread || 0,
      });
    }
    items.sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));
    setConversations(items);
  }, [user]);

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    const { data: memberOf } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    if (!memberOf || memberOf.length === 0) { setGroups([]); return; }

    const groupIds = memberOf.map(m => m.group_id);
    const { data } = await supabase
      .from('groups')
      .select('id, name, icon_url')
      .in('id', groupIds);

    setGroups((data || []) as GroupItem[]);
  }, [user]);

  useEffect(() => {
    fetchConversations();
    fetchGroups();
  }, [fetchConversations, fetchGroups]);

  // Refresh when a new message arrives
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('sidebar-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, () => {
        fetchConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchConversations]);

  // When navigating to a conversation, refresh to clear badge
  useEffect(() => {
    if (currentView.type === 'dm') {
      setTimeout(fetchConversations, 1000);
    }
  }, [currentView]);

  const initials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const statusColor = (s: string) => {
    if (s === 'online') return 'bg-green-500';
    if (s === 'busy') return 'bg-yellow-500';
    return 'bg-muted-foreground/40';
  };

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  const filtered = conversations.filter(c =>
    c.other_display_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MessageCircle className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold text-foreground">ChatApp</span>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 text-[10px] px-1.5">
                {totalUnread > 99 ? '99+' : totalUnread}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-8 w-8 relative"
              onClick={() => onNavigate({ type: 'contacts' })}
            >
              <UserPlus className="h-4 w-4" />
              {pendingIncoming.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center">
                  {pendingIncoming.length}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onNavigate({ type: 'profile' })}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Profile quick view */}
        <button
          onClick={() => onNavigate({ type: 'profile' })}
          className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-accent/50 transition-colors"
        >
          <div className="relative">
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || ''} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {initials(profile?.display_name || null)}
              </AvatarFallback>
            </Avatar>
            <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${statusColor(profile?.status || 'offline')}`} />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{profile?.display_name || 'Set your name'}</p>
            <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
          </div>
        </button>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('chats')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${tab === 'chats' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Chats
          {totalUnread > 0 && tab !== 'chats' && (
            <Badge variant="destructive" className="h-4 min-w-4 text-[9px] px-1">
              {totalUnread}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setTab('groups')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'groups' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Groups
        </button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {tab === 'chats' && (
          <div className="p-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No conversations yet</p>
                <Button variant="link" size="sm" onClick={() => onNavigate({ type: 'contacts' })}>
                  Find people
                </Button>
              </div>
            ) : (
              filtered.map((conv) => {
                const isActive = currentView.type === 'dm' && currentView.conversationId === conv.conversation_id;
                return (
                  <button
                    key={conv.conversation_id}
                    onClick={() => onNavigate({ type: 'dm', conversationId: conv.conversation_id, otherUserId: conv.other_user_id })}
                    className={`flex items-center gap-3 w-full p-2.5 rounded-lg transition-colors ${
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={conv.other_avatar_url || ''} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {initials(conv.other_display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card ${statusColor(conv.other_status)}`} />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm truncate ${conv.unread_count > 0 && !isActive ? 'font-semibold text-foreground' : 'font-medium'}`}>
                          {conv.other_display_name}
                        </p>
                        {conv.unread_count > 0 && !isActive && (
                          <Badge variant="destructive" className="h-5 min-w-5 text-[10px] px-1.5 ml-1 shrink-0">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                      {conv.last_message && (
                        <p className={`text-xs truncate ${conv.unread_count > 0 && !isActive ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
                          {conv.last_message}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {tab === 'groups' && (
          <div className="p-2">
            <CreateGroupDialog onCreated={fetchGroups} />
            {filteredGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No groups yet</p>
              </div>
            ) : (
              filteredGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => onNavigate({ type: 'group', groupId: group.id })}
                  className={`flex items-center gap-3 w-full p-2.5 rounded-lg transition-colors ${
                    currentView.type === 'group' && currentView.groupId === group.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
                    <Users className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-medium truncate text-left">{group.name}</p>
                </button>
              ))
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
