import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import ChatSidebar from '@/components/chat/ChatSidebar';
import DirectChat from '@/components/chat/DirectChat';
import GroupChatView from '@/components/chat/GroupChatView';
import ProfilePage from '@/components/chat/ProfilePage';
import ContactDiscovery from '@/components/chat/ContactDiscovery';
import { MessageCircle } from 'lucide-react';

export type ChatView =
  | { type: 'empty' }
  | { type: 'dm'; conversationId: string; otherUserId: string }
  | { type: 'group'; groupId: string }
  | { type: 'profile' }
  | { type: 'contacts' };

export default function ChatApp() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [view, setView] = useState<ChatView>({ type: 'empty' });
  usePresence();

  // true = showing sidebar, false = showing chat (mobile only)
  const isMobile = () => window.innerWidth < 768;
  const showingChat = view.type !== 'empty';

  useEffect(() => {
    const state = location.state as { openConversation?: string; otherUserId?: string } | null;
    if (state?.openConversation && state?.otherUserId) {
      setView({ type: 'dm', conversationId: state.openConversation, otherUserId: state.otherUserId });
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const handleNavigate = (v: ChatView) => {
    setView(v);
  };

  const handleBack = () => {
    setView({ type: 'empty' });
  };

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
      {/* Sidebar — full width on mobile when no chat open, fixed width on desktop */}
      <div className={`
        flex-shrink-0 border-r border-border
        ${isMobile()
          ? showingChat ? 'hidden' : 'w-full'
          : 'w-80'
        }
        md:block md:w-80
        ${showingChat ? 'hidden md:block' : 'w-full md:w-80'}
      `}>
        <ChatSidebar currentView={view} onNavigate={handleNavigate} />
      </div>

      {/* Main content — full width on mobile when chat open, flex-1 on desktop */}
      <div className={`
        flex-1 flex flex-col min-w-0
        ${!showingChat ? 'hidden md:flex' : 'flex'}
      `}>
        {view.type === 'empty' && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <MessageCircle className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Welcome to ChatHub</h2>
            <p className="text-sm text-center px-4">Select a conversation or find people to connect with</p>
          </div>
        )}
        {view.type === 'dm' && (
          <DirectChat
            conversationId={view.conversationId}
            otherUserId={view.otherUserId}
            onBack={handleBack}
          />
        )}
        {view.type === 'group' && (
          <GroupChatView groupId={view.groupId} onBack={handleBack} />
        )}
        {view.type === 'profile' && (
          <ProfilePage onBack={handleBack} />
        )}
        {view.type === 'contacts' && (
          <ContactDiscovery
            onBack={handleBack}
            onStartChat={(convId, otherUserId) => setView({ type: 'dm', conversationId: convId, otherUserId })}
          />
        )}
      </div>
    </div>
  );
}
