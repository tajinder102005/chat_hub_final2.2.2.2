import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { UploadedFile } from '@/hooks/useFileUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Users, UserPlus, Shield, UserMinus, LogOut } from 'lucide-react';
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
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
}

interface Member {
  user_id: string;
  role: string;
  display_name: string;
}

interface GroupInfo {
  id: string;
  name: string;
  icon_url: string | null;
  created_by: string;
}

interface Props {
  groupId: string;
  onBack: () => void;
}

export default function GroupChatView({ groupId, onBack }: Props) {
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const myRole = members.find(m => m.user_id === user?.id)?.role;
  const isAdmin = myRole === 'admin';

  const fetchGroup = useCallback(async () => {
    const { data } = await supabase.from('groups').select('*').eq('id', groupId).single();
    setGroup(data as GroupInfo | null);
  }, [groupId]);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase.from('group_members').select('user_id, role').eq('group_id', groupId);
    if (!data) return;
    const items: Member[] = [];
    for (const m of data) {
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('user_id', m.user_id).single();
      items.push({ user_id: m.user_id, role: m.role, display_name: prof?.display_name || 'Unknown' });
    }
    setMembers(items);
  }, [groupId]);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (data) setMessages(data as GroupMessage[]);
  }, [groupId]);

  useEffect(() => { fetchGroup(); fetchMembers(); fetchMessages(); }, [fetchGroup, fetchMembers, fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      }, () => { fetchMessages(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [groupId, fetchMessages]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (content: string, attachment?: UploadedFile) => {
    if (!user || !content.trim() && !attachment) return;
    const { error } = await supabase.from('group_messages').insert({
      group_id: groupId,
      sender_id: user.id,
      content: content.trim(),
      attachment_url: attachment?.url,
      attachment_name: attachment?.name,
      attachment_type: attachment?.type,
    });
    if (error) toast.error('Failed to send');
    else fetchMessages();
  };

  const addMember = async () => {
    if (!addEmail.trim()) return;
    const { data: prof } = await supabase.from('profiles').select('user_id').eq('email', addEmail.trim()).single();
    if (!prof) { toast.error('User not found'); return; }
    const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: prof.user_id, role: 'member' });
    if (error) {
      if (error.code === '23505') toast.error('Already a member');
      else toast.error('Failed to add member');
    } else {
      toast.success('Member added!');
      setAddEmail('');
      fetchMembers();
    }
  };

  const removeMember = async (userId: string) => {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    toast.success('Member removed');
    fetchMembers();
  };

  const leaveGroup = async () => {
    if (!user) return;
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
    toast.success('Left the group');
    onBack();
  };

  const getSenderName = (senderId: string) => {
    if (senderId === user?.id) return 'You';
    return members.find(m => m.user_id === senderId)?.display_name || 'Unknown';
  };

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{group?.name || 'Loading...'}</p>
          <p className="text-[11px] text-muted-foreground">{members.length} members</p>
        </div>
        <Dialog open={showMembers} onOpenChange={setShowMembers}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><Users className="h-4 w-4" /></Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Group Members</DialogTitle></DialogHeader>
            {isAdmin && (
              <div className="flex gap-2 mb-3">
                <Input placeholder="Add by email..." value={addEmail} onChange={e => setAddEmail(e.target.value)} className="h-9 text-sm" />
                <Button size="sm" onClick={addMember}><UserPlus className="h-4 w-4" /></Button>
              </div>
            )}
            <ScrollArea className="max-h-64">
              {members.map(m => (
                <div key={m.user_id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials(m.display_name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{m.display_name}</p>
                      {m.role === 'admin' && <span className="text-[10px] text-primary flex items-center gap-0.5"><Shield className="h-2.5 w-2.5" /> Admin</span>}
                    </div>
                  </div>
                  {isAdmin && m.user_id !== user?.id && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeMember(m.user_id)}>
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </ScrollArea>
            <div className="pt-2 border-t border-border">
              <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive gap-2" onClick={leaveGroup}>
                <LogOut className="h-4 w-4" /> Leave Group
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-2">
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isOwn = msg.sender_id === user?.id;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <Card className={`border-0 px-3.5 py-2 shadow-sm max-w-[80%] ${isOwn ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground'}`}>
                    {!isOwn && <p className="text-xs font-semibold text-primary mb-0.5">{getSenderName(msg.sender_id)}</p>}
                    {msg.attachment_url && (
                      <AttachmentPreview
                        attachment={{
                          file_url: msg.attachment_url,
                          file_name: msg.attachment_name || 'Attachment',
                          file_type: msg.attachment_type || '',
                          file_size: 0,
                        }}
                        isOwn={isOwn}
                      />
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
          <div ref={endRef} />
        </div>
      </div>

      <MessageInput onSend={handleSend} />
    </div>
  );
}
