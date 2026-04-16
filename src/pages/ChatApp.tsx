import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
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
  const [view, setView] = useState<ChatView>({ type: 'empty' });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  usePresence();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 border-r border-border flex-shrink-0 overflow-hidden`}>
        <ChatSidebar
          currentView={view}
          onNavigate={(v) => { setView(v); if (window.innerWidth < 768) setSidebarOpen(false); }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {view.type === 'empty' && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <MessageCircle className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Welcome to ChatHub</h2>
            <p className="text-sm">Select a conversation or find people to connect with</p>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="mt-4 text-sm text-primary hover:underline md:hidden"
            >
              {sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            </button>
          </div>
        )}
        {view.type === 'dm' && (
          <DirectChat
            conversationId={view.conversationId}
            otherUserId={view.otherUserId}
            onBack={() => { setView({ type: 'empty' }); setSidebarOpen(true); }}
          />
        )}
        {view.type === 'group' && (
          <GroupChatView
            groupId={view.groupId}
            onBack={() => { setView({ type: 'empty' }); setSidebarOpen(true); }}
          />
        )}
        {view.type === 'profile' && (
          <ProfilePage onBack={() => { setView({ type: 'empty' }); setSidebarOpen(true); }} />
        )}
        {view.type === 'contacts' && (
          <ContactDiscovery
            onBack={() => { setView({ type: 'empty' }); setSidebarOpen(true); }}
            onStartChat={(convId, otherUserId) => setView({ type: 'dm', conversationId: convId, otherUserId })}
          />
        )}
      </div>
    </div>
  );
}
