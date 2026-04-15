import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import MatchView from './components/MatchView';
import AdminView from './components/AdminView';
import PublicGameView from './components/PublicGameView';
import { LogOut, Shield, Trophy, Loader2 } from 'lucide-react';

export default function App() {
  // We add <any> or <string | null> to keep TypeScript happy
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [view, setView] = useState<'match' | 'admin'>('match');
  const [loading, setLoading] = useState(true);
  const [publicMatchId, setPublicMatchId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Check if the user is visiting a public match link
    const path = window.location.pathname;
    if (path.startsWith('/match/')) {
      const id = path.split('/match/')[1];
      setPublicMatchId(id);
    }

    // 2. Check for an existing login session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // 3. Listen for login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChanged((_event, session) => {
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

  // IF PUBLIC LINK: Show the live feed immediately
  if (publicMatchId) {
    return <PublicGameView gameId={publicMatchId} />;
  }

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="animate-spin text-white/20" size={40} />
    </div>
  );

  // IF NOT LOGGED IN: Show login screen
  if (!user) return <Auth />;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Navigation */}
      <nav className="glass-card m-4 p-4 flex justify-between items-center sticky top-4 z-50">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setView('match')} 
            className={`flex items-center gap-2 font-black italic transition-all ${view === 'match' ? 'text-white scale-110' : 'text-white/40 hover:text-white'}`}
          >
            <Trophy size={18} /> MATCH
          </button>
          
          {profile?.is_admin && (
            <button 
              onClick={() => setView('admin')} 
              className={`flex items-center gap-2 font-black italic transition-all ${view === 'admin' ? 'text-white scale-110' : 'text-white/40 hover:text-white'}`}
            >
              <Shield size={18} /> ADMIN
            </button>
          )}
        </div>

        <button 
          onClick={() => supabase.auth.signOut()} 
          className="p-2 text-white/20 hover:text-red-500 transition-colors"
        >
          <LogOut size={20} />
        </button>
      </nav>

      {/* Main Content */}
      <main className="p-4 pb-20">
        {view === 'admin' && profile?.is_admin ? (
          <AdminView />
        ) : (
          <MatchView user={user} profile={profile} onGoToAdmin={() => setView('admin')} />
        )}
      </main>
    </div>
  );
}
