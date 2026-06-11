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
import { cn, formatTime } from './lib/utils';

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
    // Dynamically enforce ⚽ favicon globally
    const setDynamicFavicon = () => {
      const link = (document.querySelector("link[rel*='icon']") as HTMLLinkElement) || document.createElement('link');
      link.type = 'image/svg+xml';
      link.rel = 'icon';
      link.href = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚽</text></svg>`;
      document.getElementsByTagName('head')[0].appendChild(link);
    };
    setDynamicFavicon();
    document.title = "Perth Soccer Group";

    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true);
      }
      setSession(session);
      if (session) fetchProfile(session.user.id, session.user.email);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, userEmail?: string) => {
    try {
      let email = userEmail?.toLowerCase();
      if (!email && session?.user?.email) {
        email = session.user.email.toLowerCase();
      }
      
      const isCharley = email === 'charley.moraes@gmail.com';
      console.log('fetchProfile: email =', email, 'isCharley =', isCharley);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, try to create it
        console.log('Profile missing, creating...');
        const profilePayload: any = {
          id: userId,
          full_name: email ? email.split('@')[0] : 'New Player',
          is_admin: isCharley ? true : false,
        };

        let newProfile: any = null;
        let createError: any = null;

        // Try to insert WITH is_approved first
        try {
          const { data: p1, error: e1 } = await supabase
            .from('profiles')
            .insert({
              ...profilePayload,
              is_approved: isCharley ? true : false
            })
            .select()
            .single();
          newProfile = p1;
          createError = e1;
        } catch (e1Err: any) {
          console.warn('Catch on first insert:', e1Err);
          createError = e1Err;
        }

        // If fails because is_approved column is missing, retry WITHOUT it
        if (createError && (createError.message?.includes('is_approved') || createError.code === 'PGRST204')) {
          console.log('Detected missing is_approved column, retrying insert with only essential columns...');
          try {
            const { data: p2, error: e2 } = await supabase
              .from('profiles')
              .insert(profilePayload)
              .select()
              .single();
            newProfile = p2;
            createError = e2;
          } catch (e2Err: any) {
            console.error('Catch on second insert:', e2Err);
            createError = e2Err;
          }
        }

        if (createError) {
          console.error('Error creating profile:', createError);
        }

        if (newProfile) {
          setProfile({
            ...newProfile,
            is_approved: newProfile.is_approved ?? true,
            is_admin: isCharley ? true : !!newProfile.is_admin
          });
        } else {
          // Fallback if RLS or insert completely failed but we want them to log in
          setProfile({
            id: userId,
            full_name: email ? email.split('@')[0] : 'New Player',
            is_admin: isCharley ? true : false,
            is_approved: isCharley ? true : false,
            created_at: new Date().toISOString()
          });
        }
      } else if (error) {
        console.error('Error fetching profile:', error);
        // If there is an error fetching profile (e.g. database RLS, connection, etc.)
        // let's still grant local profile so they are not blocked, especially for Charley!
        setProfile({
          id: userId,
          full_name: email ? email.split('@')[0] : 'Player',
          is_admin: isCharley ? true : false,
          is_approved: isCharley ? true : false,
          created_at: new Date().toISOString()
        });
      } else if (data) {
        const hasAdmin = data.is_admin;
        const hasApproved = data.is_approved ?? true;

        if (isCharley && (!hasAdmin || !hasApproved)) {
          console.log('Ensuring Charley has admin status...');
          
          let updatedProfile: any = null;
          let updateError: any = null;

          // Try updating with is_approved first
          try {
            const { data: u1, error: ue1 } = await supabase
              .from('profiles')
              .update({ is_admin: true, is_approved: true })
              .eq('id', userId)
              .select()
              .single();
            updatedProfile = u1;
            updateError = ue1;
          } catch (ue1Err: any) {
            console.warn('Catch on first update:', ue1Err);
            updateError = ue1Err;
          }

          // If fails because is_approved column is missing, retry with ONLY is_admin
          if (updateError && (updateError.message?.includes('is_approved') || updateError.code === 'PGRST204')) {
            console.log('Detected missing is_approved column, retrying update with only is_admin...');
            try {
              const { data: u2, error: ue2 } = await supabase
                .from('profiles')
                .update({ is_admin: true })
                .eq('id', userId)
                .select()
                .single();
              updatedProfile = u2;
              updateError = ue2;
            } catch (ue2Err: any) {
              console.error('Catch on second update:', ue2Err);
              updateError = ue2Err;
            }
          }

          // Even if update failed on backend due to RLS, make sure we force is_admin: true on client side!
          setProfile({
            ...(updatedProfile || data),
            is_admin: true,
            is_approved: true
          });
        } else {
          setProfile({
            ...data,
            is_approved: data.is_approved ?? true,
            is_admin: isCharley ? true : !!data.is_admin
          });
        }
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
      fetchProfile(session.user.id, session.user.email);
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
                  // Find the active game and copy its link with details for WhatsApp
                  supabase.from('games')
                    .select('id, location, date, time')
                    .neq('status', 'finished')
                    .order('date', { ascending: false })
                    .limit(1)
                    .single()
                    .then(({ data, error }) => {
                      if (error) {
                        console.error('Error fetching game for share:', error);
                        alert('Could not find an active game to share.');
                        return;
                      }

                      if (data) {
                        // Format: [Location] [Time] [Day] [DD/MM] [Live Link]
                        // We use a fixed date conversion to avoid timezone shifts on the share string
                        const [year, month, day] = data.date.split('-').map(Number);
                        const dateObj = new Date(year, month - 1, day);
                        
                        const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'long' });
                        const dd = String(dateObj.getDate()).padStart(2, '0');
                        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                        
                        // Handle time formatting (ensure it's clean e.g. 6:45 pm)
                        const cleanTime = formatTime(data.time).toLowerCase();
                        
                        const url = `${window.location.origin}/match/${data.id}`;
                        const shareText = `${data.location} ${cleanTime} ${dayName} ${dd}/${mm} ${url}`;
                        
                        navigator.clipboard.writeText(shareText);
                        alert('Share text copied to clipboard!\n\n' + shareText);
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
