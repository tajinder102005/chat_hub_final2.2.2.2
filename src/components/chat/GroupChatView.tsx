import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { UploadedFile } from '@/hooks/useFileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Users, UserPlus, Shield, UserMinus,
  LogOut, Settings, Search, Link, Camera, Edit2, X
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import MessageInput from '@/components/chat/MessageInput';
import AttachmentPreview from '@/components/chat/AttachmentPreview';

interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_system?: boolean;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
}

interface Member {
  user_id: string;
  role: string;
  display_name: string;
  avatar_url?: string | null;
  email?: string;
}

interface GroupInfo {
  id: string;
  name: string;
  icon_url: string | null;
  created_by: string;
  description?: string;
  invite_code?: string;
}

interface Props {
  groupId: string;
  onBack: () => void;
}

type Panel = 'members' | 'settings' | 'search' | null;

export default function GroupChatView({ groupId, onBack }: Props) {
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Add member
  const [addEmail, setAddEmail] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit group
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<any>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  const myRole = members.find(m => m.user_id === user?.id)?.role;
  const isAdmin = myRole === 'admin';

  const fetchGroup = useCallback(async () => {
    const { data } = await supabase.from('groups').select('*').eq('id', groupId).single();
    if (data) {
      setGroup(data as GroupInfo);
      setEditName((data as any).name || '');
      setEditDesc((data as any).description || '');
    }
  }, [groupId]);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase.from('group_members').select('user_id, role').eq('group_id', groupId);
    if (!data) return;
    const items: Member[] = [];
    for (const m of data) {
      const { data: prof } = await supabase.from('profiles').select('display_name, avatar_url, email').eq('user_id', m.user_id).single();
      items.push({
        user_id: m.user_id,
        role: m.role,
        display_name: prof?.display_name || prof?.email || 'Unknown',
        avatar_url: prof?.avatar_url,
        email: prof?.email,
      });
    }
    setMembers(items);
  }, [groupId]);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('group_messages').select('*').eq('group_id', groupId)
      .order('created_at', { ascending: true }).limit(200);
    if (data) setMessages(data as GroupMessage[]);
  }, [groupId]);

  useEffect(() => { fetchGroup(); fetchMembers(); fetchMessages(); }, [fetchGroup, fetchMembers, fetchMessages]);

  // Realtime messages
  useEffect(() => {
    const channel = supabase.channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId, fetchMessages]);

  // Typing indicator
  useEffect(() => {
    const ch = supabase.channel(`group-typing-${groupId}`);
    typingChannel.current = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      const typing = Object.values(state).flat()
        .filter((p: any) => p.user_id !== user?.id && p.typing)
        .map((p: any) => p.display_name || 'Someone');
      setTypingUsers(typing);
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const me = members.find(m => m.user_id === user?.id);
        await ch.track({ user_id: user?.id, display_name: me?.display_name, typing: false });
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [groupId, user?.id, members]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleTyping = () => {
    if (!typingChannel.current) return;
    const me = members.find(m => m.user_id === user?.id);
    typingChannel.current.track({ user_id: user?.id, display_name: me?.display_name, typing: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      typingChannel.current?.track({ user_id: user?.id, display_name: me?.display_name, typing: false });
    }, 2000);
  };

  const handleSend = async (content: string, attachment?: UploadedFile) => {
    if (!user || (!content.trim() && !attachment)) return;
    const { error } = await supabase.from('group_messages').insert({
      group_id: groupId, sender_id: user.id, content: content.trim(),
      attachment_url: attachment?.url, attachment_name: attachment?.name, attachment_type: attachment?.type,
    });
    if (error) toast.error('Failed to send');
  };

  const addMember = async () => {
    if (!addEmail.trim()) return;
    setAdding(true);
    const { error } = await supabase.rpc('add_group_member_by_email' as any, {
      gid: groupId, member_email: addEmail.trim()
    });
    if (error) toast.error(error.message);
    else { toast.success('Member added!'); setAddEmail(''); fetchMembers(); fetchMessages(); }
    setAdding(false);
  };

  const removeMember = async (userId: string) => {
    const { error } = await supabase.rpc('remove_group_member' as any, { gid: groupId, target_user_id: userId });
    if (error) toast.error(error.message);
    else { toast.success('Member removed'); fetchMembers(); }
  };

  const toggleAdmin = async (userId: string) => {
    const { error } = await supabase.rpc('toggle_group_admin' as any, { gid: groupId, target_user_id: userId });
    if (error) toast.error(error.message);
    else { toast.success('Role updated!'); fetchMembers(); }
  };

  const leaveGroup = async () => {
    if (!user) return;
    const { error } = await supabase.rpc('remove_group_member' as any, { gid: groupId, target_user_id: user.id });
    if (error) toast.error(error.message);
    else { toast.success('Left the group'); onBack(); }
  };

  const saveGroupInfo = async () => {
    setEditSaving(true);
    const { error } = await supabase.rpc('update_group_info' as any, {
      gid: groupId, new_name: editName.trim(), new_description: editDesc.trim(), new_icon_url: null
    });
    if (error) toast.error(error.message);
    else { toast.success('Group updated!'); fetchGroup(); setPanel(null); }
    setEditSaving(false);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingIcon(true);
    const ext = file.name.split('.').pop();
    const path = `groups/${groupId}/icon.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) { toast.error('Upload failed'); setUploadingIcon(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: updateErr } = await supabase.rpc('update_group_info' as any, {
      gid: groupId, new_name: null, new_description: null, new_icon_url: publicUrl
    });
    if (updateErr) toast.error('Failed to update icon');
    else { toast.success('Group icon updated!'); fetchGroup(); }
    setUploadingIcon(false);
  };

  const copyInviteLink = () => {
    if (!group?.invite_code) return;
    const link = `${window.location.origin}/join/${group.invite_code}`;
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied!');
  };

  const getSenderName = (senderId: string) => {
    if (senderId === user?.id) return 'You';
    return members.find(m => m.user_id === senderId)?.display_name || 'Unknown';
  };

  const initials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

  const filteredMessages = searchQuery
    ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  return (
    <div className="flex h-full">
      {/* Main chat */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="relative cursor-pointer" onClick={() => setPanel('settings')}>
            <Avatar className="h-9 w-9">
              <AvatarImage src={group?.icon_url || ''} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {initials(group?.name || '')}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setPanel('members')}>
            <p className="text-sm font-semibold truncate">{group?.name || 'Loading...'}</p>
            <p className="text-[11px] text-muted-foreground">{members.length} members</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPanel(panel === 'search' ? null : 'search')}>
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPanel(panel === 'members' ? null : 'members')}>
              <Users className="h-4 w-4" />
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>

        {/* Search bar */}
        {panel === 'search' && (
          <div className="px-4 py-2 border-b border-border bg-card">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search messages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            {searchQuery && (
              <p className="text-xs text-muted-foreground mt-1">
                {filteredMessages.filter(m => !m.is_system).length} result(s)
              </p>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto max-w-3xl space-y-2">
            <AnimatePresence initial={false}>
              {filteredMessages.map((msg) => {
                const isOwn = msg.sender_id === user?.id;
                if (msg.is_system) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <span className="text-[11px] text-muted-foreground bg-accent/50 px-3 py-1 rounded-full">
                        {msg.content}
                      </span>
                    </div>
                  );
                }
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {!isOwn && (
                      <Avatar className="h-7 w-7 mr-2 mt-1 flex-shrink-0">
                        <AvatarImage src={members.find(m => m.user_id === msg.sender_id)?.avatar_url || ''} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {initials(getSenderName(msg.sender_id))}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <Card className={`border-0 px-3.5 py-2 shadow-sm max-w-[75%] ${isOwn ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                      {!isOwn && <p className="text-xs font-semibold text-primary mb-0.5">{getSenderName(msg.sender_id)}</p>}
                      {msg.attachment_url && (
                        <AttachmentPreview attachment={{ file_url: msg.attachment_url, file_name: msg.attachment_name || 'Attachment', file_type: msg.attachment_type || '', file_size: 0 }} isOwn={isOwn} />
                      )}
                      {msg.content && <p className="text-sm leading-relaxed">{msg.content}</p>}
                      <p className={`mt-0.5 text-[10px] ${isOwn ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground'}`}>
                        {format(new Date(msg.created_at), 'h:mm a')}
                      </p>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {typingUsers.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-card rounded-lg px-4 py-2 text-xs text-muted-foreground animate-pulse">
                  {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <MessageInput onSend={handleSend} onTyping={handleTyping} />
      </div>

      {/* Side panel */}
      {panel && panel !== 'search' && (
        <div className="w-72 border-l border-border bg-card flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">{panel === 'members' ? 'Members' : 'Group Settings'}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPanel(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {panel === 'members' && (
              <div className="p-3 space-y-3">
                {/* Add member (admin only) */}
                {isAdmin && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Add by email</Label>
                    <div className="flex gap-2">
                      <Input value={addEmail} onChange={e => setAddEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addMember()}
                        placeholder="email@example.com" className="h-8 text-xs flex-1" />
                      <Button size="sm" className="h-8 px-2" onClick={addMember} disabled={adding}>
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Invite link */}
                <Button variant="outline" size="sm" className="w-full gap-2 h-8 text-xs" onClick={copyInviteLink}>
                  <Link className="h-3.5 w-3.5" /> Copy Invite Link
                </Button>

                {/* Member list */}
                <div className="space-y-1">
                  {members.map(m => (
                    <div key={m.user_id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={m.avatar_url || ''} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{initials(m.display_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{m.display_name}</p>
                        {m.role === 'admin' && (
                          <span className="text-[10px] text-yellow-500 flex items-center gap-0.5">
                            <Shield className="h-2.5 w-2.5" /> Admin
                          </span>
                        )}
                      </div>
                      {isAdmin && m.user_id !== user?.id && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" title={m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                            onClick={() => toggleAdmin(m.user_id)}>
                            <Shield className={`h-3 w-3 ${m.role === 'admin' ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeMember(m.user_id)}>
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Leave group */}
                <div className="pt-2 border-t border-border">
                  <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive gap-2" onClick={leaveGroup}>
                    <LogOut className="h-4 w-4" /> Leave Group
                  </Button>
                </div>
              </div>
            )}

            {panel === 'settings' && isAdmin && (
              <div className="p-3 space-y-4">
                {/* Group icon */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <Avatar className="h-20 w-20">
                      <AvatarImage src={group?.icon_url || ''} />
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initials(group?.name || '')}</AvatarFallback>
                    </Avatar>
                    <label className="absolute bottom-0 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90">
                      {uploadingIcon
                        ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        : <Camera className="h-3.5 w-3.5" />
                      }
                      <input type="file" accept="image/*" className="hidden" onChange={handleIconUpload} disabled={uploadingIcon} />
                    </label>
                  </div>
                </div>

                {/* Edit name */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Group Name</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-9 text-sm" />
                </div>

                {/* Edit description */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} className="text-sm resize-none" placeholder="What's this group about?" />
                </div>

                <Button onClick={saveGroupInfo} disabled={editSaving} className="w-full" size="sm">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </Button>

                {/* Invite link */}
                <div className="pt-2 border-t border-border">
                  <Button variant="outline" size="sm" className="w-full gap-2" onClick={copyInviteLink}>
                    <Link className="h-4 w-4" /> Copy Invite Link
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1 text-center">Anyone with this link can join</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
