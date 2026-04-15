import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import MatchView from './components/MatchView';
import HistoryView from './components/HistoryView';
import AdminView from './components/AdminView';
import PublicGameView from './components/PublicGameView';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, History, ShieldAlert, LogOut, RefreshCw, Share2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'match' | 'history' | 'admin'>('match');
  const [loading, setLoading] = useState(true);
  const [publicMatchId, setPublicMatchId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check for public links
    const path = window.location.pathname;
    if (path.startsWith('/match/')) {
      const id = path.split('/match/')[1];
      setPublicMatchId(id);
    }

    // 2. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // 3. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    setProfile(data);
    setLoading(false);
  };

  const handleRefresh = () => {
    if (user) {
      setLoading(true);
      fetchProfile(user.id);
    }
  };

  const shareLiveLink = async () => {
    const { data } = await supabase.from('games')
      .select('id')
      .neq('status', 'finished')
      .order('date', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      const url = `${window.location.origin}/match/${data.id}`;
      navigator.clipboard.writeText(url);
      alert('Live Match link copied to clipboard!');
    } else {
      alert('No active game found to share.');
    }
  };

  if (publicMatchId) {
    return <PublicGameView gameId={publicMatchId} />;
  }

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white animate-pulse text-4xl font-black tracking-tighter italic">PSG PERTH</div>
    </div>
  );

  if (!user) return <Auth />;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Polished Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-2xl font-black tracking-tighter text-white italic">PSG PERTH</div>
          
          <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('match')}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-bold text-sm ${activeTab === 'match' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
            >
              <Trophy size={18} /> Match
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-bold text-sm ${activeTab === 'history' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
            >
              <History size={18} /> History
            </button>
            {profile?.is_admin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-bold text-sm ${activeTab === 'admin' ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
              >
                <ShieldAlert size={18} /> Admin
              </button>
            )}
          </nav>

          <div className="flex items-center gap-4">
            {profile?.is_admin && (
              <button onClick={shareLiveLink} className="p-2 text-white/40 hover:text-white transition-colors">
                <Share2 size={18} />
              </button>
            )}
            <button onClick={handleRefresh} className="p-2 text-white/40 hover:text-white transition-colors">
              <RefreshCw size={18} />
            </button>
            <div className="hidden md:block text-right">
              <div className="text-sm font-bold">{profile?.full_name}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-widest">
                {profile?.is_admin ? 'Admin Access' : 'Player'}
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut()} className="p-2 text-white/40 hover:text-red-500 transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 md:p-12 max-w-6xl mx-auto mt-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'match' && <MatchView user={user} profile={profile} />}
            {activeTab === 'history' && <HistoryView user={user} />}
            {activeTab === 'admin' && profile?.is_admin && <AdminView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Navigation (Bottom Bar) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/5 px-6 py-4">
        <div className="flex items-center justify-around">
          <button onClick={() => setActiveTab('match')} className={`flex flex-col items-center gap-1 ${activeTab === 'match' ? 'text-white' : 'text-white/40'}`}>
            <Trophy size={24} />
            <span className="text-[10px] font-bold uppercase">Match</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 ${activeTab === 'history' ? 'text-white' : 'text-white/40'}`}>
            <History size={24} />
            <span className="text-[10px] font-bold uppercase">History</span>
          </button>
          {profile?.is_admin && (
            <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-white' : 'text-white/40'}`}>
              <ShieldAlert size={24} />
              <span className="text-[10px] font-bold uppercase">Admin</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
