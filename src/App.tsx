import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { Profile } from './types';
import Auth from './components/Auth';
import UpdatePassword from './components/UpdatePassword';
import MatchView from './components/MatchView';
import HistoryView from './components/HistoryView';
import AdminView from './components/AdminView';
import PublicGameView from './components/PublicGameView';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, History, ShieldAlert, LogOut, Menu, X, AlertTriangle, ExternalLink, RefreshCw, Share2 } from 'lucide-react';
import { cn } from './lib/utils';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'match' | 'history' | 'admin'>('match');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Handle Public Route
  const path = window.location.pathname;
  const isPublicRoute = path.startsWith('/game-feed/') || path.startsWith('/match/');
  const publicGameId = isPublicRoute ? path.split('/')[2] : null;

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, try to create it
        console.log('Profile missing, creating...');
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              full_name: userData.user.user_metadata.full_name || 'New Player',
              is_admin: false,
              is_approved: false // Require admin approval
            })
            .select()
            .single();
          
          if (createError) console.error('Error creating profile:', createError);
          if (newProfile) setProfile(newProfile);
        }
      } else if (error) {
        console.error('Error fetching profile:', error);
      } else if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => supabase.auth.signOut();
  const handleRefresh = () => {
    if (session) {
      setLoading(true);
      fetchProfile(session.user.id);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card max-w-lg w-full p-8 text-center space-y-6 border-yellow-500/20"
        >
          <div className="bg-yellow-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-yellow-500/20">
            <AlertTriangle className="text-yellow-500" size={32} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Supabase Setup Required</h1>
            <p className="text-white/60">
              To use this app, you need to connect your own Supabase project.
            </p>
          </div>
          
          <div className="bg-white/5 rounded-xl p-6 text-left space-y-4 border border-white/10">
            <p className="text-sm font-medium">Follow these steps:</p>
            <ol className="text-sm text-white/60 space-y-3 list-decimal list-inside">
              <li>Go to your <span className="text-white font-bold">Supabase Dashboard</span></li>
              <li>Navigate to <span className="text-white font-bold">Project Settings &gt; API</span></li>
              <li>Copy the <span className="text-pitch font-bold">Project URL</span> and <span className="text-pitch font-bold">anon public key</span></li>
              <li>In AI Studio, open <span className="text-white font-bold">Settings &gt; Secrets</span></li>
              <li>Add <code className="bg-white/10 px-1 rounded text-pitch">VITE_SUPABASE_URL</code></li>
              <li>Add <code className="bg-white/10 px-1 rounded text-pitch">VITE_SUPABASE_ANON_KEY</code></li>
            </ol>
          </div>

          <a 
            href="https://supabase.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-pitch hover:underline text-sm font-bold"
          >
            Go to Supabase <ExternalLink size={14} />
          </a>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-pitch animate-pulse text-4xl font-black tracking-tighter">PSG PERTH</div>
      </div>
    );
  }

  if (isResettingPassword) {
    return <UpdatePassword onComplete={() => setIsResettingPassword(false)} />;
  }

  if (isPublicRoute && publicGameId) {
    return <PublicGameView gameId={publicGameId} />;
  }

  if (!session) return <Auth />;

  const tabs = [
    { id: 'match', label: 'Match', icon: Trophy },
    { id: 'history', label: 'History', icon: History },
    { id: 'admin', label: 'Admin', icon: ShieldAlert },
  ] as const;

  return (
    <div className="min-h-screen bg-black pb-24 md:pb-0 md:pt-20">
      {/* Header / Desktop Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-xl md:text-2xl font-black tracking-tighter text-white italic">PSG PERTH</div>
          
          <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-xl">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-bold text-sm",
                  activeTab === tab.id ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]" : "text-white/60 hover:text-white"
                )}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {profile?.is_admin && activeTab === 'match' && (
              <button 
                onClick={() => {
                  // Find the active game and copy its link
                  supabase.from('games')
                    .select('id')
                    .neq('status', 'finished')
                    .order('date', { ascending: false })
                    .limit(1)
                    .single()
                    .then(({ data }) => {
                      if (data) {
                        const url = `${window.location.origin}/match/${data.id}`;
                        navigator.clipboard.writeText(url);
                        alert('Live Match link copied to clipboard!');
                      } else {
                        alert('No active game found to share.');
                      }
                    });
                }}
                className="p-2 text-white/40 hover:text-white transition-colors"
                title="Share Live List"
              >
                <Share2 size={18} />
              </button>
            )}
            <button 
              onClick={handleRefresh}
              className="p-2 text-white/40 hover:text-white transition-colors"
              title="Refresh Profile"
            >
              <RefreshCw size={18} />
            </button>
            <div className="hidden md:block text-right">
              <div className="text-sm font-bold">{profile?.full_name}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-widest">
                {profile?.is_admin ? 'Admin Access' : 'Player'}
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-white/40 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 md:p-12 max-w-6xl mx-auto mt-16 md:mt-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'match' && <MatchView user={session.user} profile={profile} onGoToAdmin={() => setActiveTab('admin')} />}
            {activeTab === 'history' && <HistoryView user={session.user} />}
            {activeTab === 'admin' && (
              profile?.is_admin ? <AdminView /> : (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                  <div className="bg-white/5 p-6 rounded-full border border-white/10">
                    <ShieldAlert size={48} className="text-white/20" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Admin Access Required</h2>
                    <p className="text-white/40 max-w-md">
                      Your account currently has "Player" status. To access the admin panel, you need to be granted admin privileges.
                    </p>
                  </div>
                  <div className="bg-white/10 p-4 rounded-xl border border-white/20 text-white text-sm font-medium">
                    Current Status: {profile?.full_name} (Player)
                  </div>
                </div>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-4">
        <div className="flex items-center justify-around">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                activeTab === tab.id ? "text-white" : "text-white/40"
              )}
            >
              <tab.icon size={24} className={cn(activeTab === tab.id && "drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]")} />
              <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
