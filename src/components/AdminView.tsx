import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, Profile } from '../types';
import { motion } from 'motion/react';
import { Plus, Users, Shield, Trash2, Check, X, Copy, Flag, Share2, Trophy, Loader2 } from 'lucide-react';
import { cn, formatDate, formatTime } from '../lib/utils';

export default function AdminView() {
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGameDate, setNewGameDate] = useState('');
  const [newGameTime, setNewGameTime] = useState('18:45');
  const [newGameLocation, setNewGameLocation] = useState('Rivervale');

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [togglingAdminId, setTogglingAdminId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [gamesRes, profilesRes] = await Promise.all([
      supabase.from('games').select('*').order('date', { ascending: false }),
      supabase.from('profiles').select('*').order('full_name', { ascending: true })
    ]);

    if (gamesRes.data) setGames(gamesRes.data);
    if (profilesRes.data) {
      setProfiles(profilesRes.data);
    }
    setLoading(false);
  };

  const activeGames = games.filter(g => g.status !== 'finished');
  const historyGames = games.filter(g => g.status === 'finished');
  const activeGame = activeGames[0]; // There should only be one active game based on our logic

  const createGame = async (copyPrevious = false) => {
    if (activeGame) {
      alert('Only one active game can exist at a time. Please finish or delete the current game first.');
      return;
    }

    let gameData = {
      date: newGameDate,
      time: newGameTime,
      location: newGameLocation,
      status: 'open'
    };

    if (copyPrevious && games.length > 0) {
      const last = games[0];
      gameData.time = last.time;
      gameData.location = last.location;
    }

    if (!gameData.date) {
      alert('Please select a date');
      return;
    }

    const { error } = await supabase.from('games').insert(gameData);
    if (error) alert(error.message);
    else fetchData();
  };
  
  const copyPublicLink = (game: Game) => {
    // Format: [Location] [Time] [Day] [DD/MM] [Live Link]
    const [year, month, day] = game.date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    
    const dayName = dateObj.toLocaleDateString('en-AU', { weekday: 'long' });
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    
    const cleanTime = formatTime(game.time).toLowerCase();
    const url = `${window.location.origin}/match/${game.id}`;
    const shareText = `${game.location} ${cleanTime} ${dayName} ${dd}/${mm} ${url}`;

    navigator.clipboard.writeText(shareText);
    alert('Share text copied to clipboard!\n\n' + shareText);
  };

  const toggleAdmin = async (profileId: string, currentStatus: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === profileId && currentStatus) {
      alert("You cannot remove your own admin status to prevent lockout.");
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !currentStatus })
      .eq('id', profileId);
    
    if (error) alert(error.message);
    else {
      setTogglingAdminId(null);
      fetchData();
    }
  };

  const drawTeams = async (gameId: string) => {
    const { data: rsvps } = await supabase
      .from('rsvps')
      .select('*, profiles(*)')
      .eq('game_id', gameId)
      .eq('status', 'confirmed');

    if (!rsvps || rsvps.length < 2) {
      alert('Not enough players to draw teams (min 2)');
      return;
    }

    const playing = rsvps.map(r => r.profiles).filter(Boolean) as Profile[];
    const shuffled = [...playing].sort(() => Math.random() - 0.5);
    const mid = Math.ceil(shuffled.length / 2);
    const teamA = shuffled.slice(0, mid);
    const teamB = shuffled.slice(mid);

    const { error } = await supabase
      .from('games')
      .update({ team_a: teamA, team_b: teamB })
      .eq('id', gameId);

    if (error) alert(error.message);
    else fetchData();
  };

  const updateGameStatus = async (gameId: string, status: string) => {
    let updateData: any = { status };
    
    if (status === 'finished') {
      // Calculate MVP
      const { data: votes } = await supabase
        .from('votes')
        .select('candidate_id')
        .eq('game_id', gameId);
      
      if (votes && votes.length > 0) {
        const counts: Record<string, number> = {};
        votes.forEach(v => counts[v.candidate_id] = (counts[v.candidate_id] || 0) + 1);
        const winnerId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        const winner = profiles.find(p => p.id === winnerId);
        if (winner) updateData.mvp_winner = winner.full_name;
      }
    }

    const { error } = await supabase.from('games').update(updateData).eq('id', gameId);
    if (error) alert(error.message);
    else fetchData();
  };

  const copyMVPPoll = (game: Game) => {
    const appUrl = window.location.origin;
    const pollText = `🏆 *MVP VOTING: ${game.date}*\n\nVote for the best player of the match here:\n${appUrl}\n\n_Only confirmed players can vote!_`;
    
    navigator.clipboard.writeText(pollText);
    alert('Voting link copied to clipboard! Paste it in WhatsApp.');
  };

  const deleteGame = async (gameId: string) => {
    const { error } = await supabase.from('games').delete().eq('id', gameId);
    if (error) alert(error.message);
    else {
      setDeletingGameId(null);
      fetchData();
    }
  };

  const approveUser = async (profileId: string) => {
    setApprovingId(profileId);
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', profileId);
    
    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      // Update local state immediately for better UX
      setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_approved: true } : p));
    }
    setApprovingId(null);
  };

  const revokeAccess = async (profileId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === profileId) {
      alert("You cannot revoke your own access.");
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: false })
      .eq('id', profileId);
    
    if (error) alert(error.message);
    else {
      setDeletingProfileId(null);
      fetchData();
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch"></div></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="space-y-4">
        <h1 className="text-5xl font-black tracking-tighter text-pitch italic">ADMIN PANEL</h1>
        <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Manage games, players and polls.</p>
      </div>

      {/* Create Game */}
      <section className="space-y-6">
        <h2 className="text-3xl flex items-center gap-2 font-black tracking-tighter">
          <Plus className="text-pitch" /> CREATE NEW GAME
        </h2>
        
        {activeGame ? (
          <div className="bg-yellow-500/10 border border-yellow-500/20 p-6 rounded-2xl flex items-center gap-4">
            <Flag className="text-yellow-500" size={24} />
            <div>
              <p className="font-bold text-yellow-500">Active game in progress</p>
              <p className="text-sm text-white/40">You must finish or delete the current game on {activeGame.date} before creating a new one.</p>
            </div>
          </div>
        ) : (
          <div className="glass-card p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs text-white/40 uppercase font-bold">Date</label>
              <input 
                type="date" 
                value={newGameDate}
                onChange={e => setNewGameDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 focus:border-pitch outline-none" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/40 uppercase font-bold">Time</label>
              <input 
                type="time" 
                value={newGameTime}
                onChange={e => setNewGameTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 focus:border-pitch outline-none" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/40 uppercase font-bold">Location</label>
              <input 
                type="text" 
                value={newGameLocation}
                onChange={e => setNewGameLocation(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2 focus:border-pitch outline-none" 
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => createGame()}
                className="flex-1 bg-pitch text-black font-bold py-2 rounded-lg hover:bg-pitch-dark transition-all"
              >
                Create
              </button>
              <button 
                onClick={() => createGame(true)}
                title="Copy Previous Game"
                className="bg-white/10 p-2 rounded-lg hover:bg-white/20 transition-all"
              >
                <Copy size={20} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Active Games */}
      <section className="space-y-6">
        <h2 className="text-3xl flex items-center gap-2 font-black tracking-tighter uppercase">
          <Flag className="text-pitch" /> Active Match
        </h2>
        <div className="space-y-4">
          {activeGames.map(game => (
            <div key={game.id} className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 neon-border">
              <div className="space-y-1">
                <div className="font-black text-xl tracking-tight">{game.date}</div>
                <div className="text-sm text-white/40 font-bold uppercase tracking-widest">
                  {game.location} @ {formatTime(game.time)}
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <span className={cn(
                  "text-[10px] uppercase font-black px-3 py-1 rounded-full tracking-tighter",
                  game.status === 'open' ? "bg-pitch text-black" :
                  game.status === 'closed' ? "bg-yellow-500 text-black" :
                  game.status === 'voting' ? "bg-blue-500 text-black" :
                  "bg-white/10 text-white/40"
                )}>
                  {game.status}
                </span>

                {game.status === 'open' && (
                  <>
                    <button 
                      onClick={() => copyPublicLink(game)} 
                      className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-all flex items-center gap-2"
                    >
                      <Share2 size={14} /> Share Live List
                    </button>
                    <button 
                      onClick={() => updateGameStatus(game.id, 'closed')} 
                      className="bg-white/10 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/20 transition-all flex items-center gap-2"
                    >
                      <X size={14} /> Close RSVP
                    </button>
                  </>
                )}

                {game.status === 'closed' && (
                  <>
                    <button 
                      onClick={() => drawTeams(game.id)} 
                      className="bg-pitch text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-pitch-dark transition-all flex items-center gap-2"
                    >
                      <Share2 size={14} /> Draw Teams
                    </button>
                    <button 
                      onClick={() => updateGameStatus(game.id, 'voting')} 
                      className="bg-pitch text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-pitch-dark transition-all flex items-center gap-2"
                    >
                      <Trophy size={14} /> End game and start MVP Poll
                    </button>
                  </>
                )}

                {game.status === 'voting' && (
                  <>
                    <button 
                      onClick={() => copyMVPPoll(game)} 
                      className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-all flex items-center gap-2"
                    >
                      <Copy size={14} /> Copy WhatsApp Poll
                    </button>
                    <button 
                      onClick={() => updateGameStatus(game.id, 'finished')} 
                      className="bg-highlight text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-600 transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(255,59,48,0.3)]"
                    >
                      <Check size={14} /> Close Voting & End Match
                    </button>
                  </>
                )}

                {deletingGameId === game.id ? (
                  <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded-xl border border-red-500/20">
                    <span className="text-[10px] font-bold text-red-500 uppercase">Do you really want to delete?</span>
                    <button 
                      onClick={() => deleteGame(game.id)} 
                      className="bg-red-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all"
                    >
                      Yes, Proceed
                    </button>
                    <button 
                      onClick={() => setDeletingGameId(null)} 
                      className="bg-white/10 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-white/20 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeletingGameId(game.id)} 
                    className="p-2 text-white/20 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {activeGames.length === 0 && <p className="text-white/20 italic text-center py-10">No active games.</p>}
        </div>
      </section>

      {/* Match History */}
      <section className="space-y-6">
        <h2 className="text-3xl flex items-center gap-2 font-black tracking-tighter uppercase">
          <Trophy className="text-pitch" /> Match History
        </h2>
        <div className="space-y-4">
          {historyGames.map(game => (
            <div key={game.id} className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 opacity-60 hover:opacity-100 transition-opacity">
              <div className="space-y-1">
                <div className="font-black text-xl tracking-tight">{game.date}</div>
                <div className="text-sm text-white/40 font-bold uppercase tracking-widest">
                  {game.location} • MVP: {game.mvp_winner || 'N/A'}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {deletingGameId === game.id ? (
                  <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded-xl border border-red-500/20">
                    <span className="text-[10px] font-bold text-red-500 uppercase">Delete history?</span>
                    <button 
                      onClick={() => deleteGame(game.id)} 
                      className="bg-red-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all"
                    >
                      Yes, Proceed
                    </button>
                    <button 
                      onClick={() => setDeletingGameId(null)} 
                      className="bg-white/10 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-white/20 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeletingGameId(game.id)} 
                    className="p-2 text-white/20 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {historyGames.length === 0 && <p className="text-white/20 italic text-center py-10">No match history yet.</p>}
        </div>
      </section>

      {/* User Management */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-3xl flex items-center gap-2 font-black tracking-tighter">
            <Users className="text-pitch" /> USER MANAGEMENT
          </h2>
          <div className="relative">
            <input 
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus:border-pitch outline-none text-sm w-full md:w-64"
            />
          </div>
        </div>
        
        <div className="glass-card overflow-hidden">
          {/* Desktop Table */}
          <table className="hidden md:table w-full text-left border-collapse">
            <thead className="bg-white/5 text-white/40 text-[10px] uppercase font-black tracking-widest">
              <tr>
                <th className="p-6">Name</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {profiles
                .filter(p => p.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(profile => (
                <tr key={profile.id} className={cn(
                  "hover:bg-white/5 transition-colors",
                  !profile.is_approved && "bg-yellow-500/5"
                )}>
                  <td className="p-6">
                    <div className="font-bold">{profile.full_name}</div>
                    <div className="text-[10px] text-white/20 uppercase tracking-widest">{profile.phone_number || 'No Phone'}</div>
                  </td>
                  <td className="p-6">
                    {!profile.is_approved ? (
                      <span className="text-[10px] bg-yellow-500 text-black px-2 py-1 rounded font-black uppercase">Pending Approval</span>
                    ) : (
                      <span className="text-[10px] bg-pitch/20 text-pitch px-2 py-1 rounded font-black uppercase">Active</span>
                    )}
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!profile.is_approved ? (
                        <button 
                          onClick={() => approveUser(profile.id)}
                          disabled={approvingId === profile.id}
                          className="bg-pitch text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-pitch-dark transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          {approvingId === profile.id ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <Check size={14} />
                          )}
                          {approvingId === profile.id ? 'Approving...' : 'Approve'}
                        </button>
                      ) : (
                        <>
                          {togglingAdminId === profile.id ? (
                            <div className="flex items-center gap-2 bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20">
                              <span className="text-[10px] font-bold text-yellow-500 uppercase">Confirm Access Change?</span>
                              <button 
                                onClick={() => toggleAdmin(profile.id, profile.is_admin)}
                                className="bg-pitch text-black px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-pitch-dark transition-all"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setTogglingAdminId(null)}
                                className="bg-white/10 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-white/20 transition-all"
                              >
                                No
                              </button>
                            </div>
                          ) : deletingProfileId === profile.id ? (
                            <div className="flex items-center gap-2 bg-red-500/10 p-2 rounded-xl border border-red-500/20">
                              <span className="text-[10px] font-bold text-red-500 uppercase">Revoke Access?</span>
                              <button 
                                onClick={() => revokeAccess(profile.id)}
                                className="bg-red-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-red-600 transition-all"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setDeletingProfileId(null)}
                                className="bg-white/10 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-white/20 transition-all"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setTogglingAdminId(profile.id)}
                                className={cn(
                                  "px-4 py-2 rounded-xl transition-all text-xs font-bold flex items-center gap-2",
                                  profile.is_admin 
                                    ? "bg-pitch/10 text-pitch border border-pitch/20" 
                                    : "bg-white/5 text-white/40 hover:text-white border border-white/10"
                                )}
                              >
                                <Shield size={14} />
                                {profile.is_admin ? 'Admin' : 'Make Admin'}
                              </button>
                              <button 
                                onClick={() => setDeletingProfileId(profile.id)}
                                className="p-2 text-white/20 hover:text-red-500 transition-colors"
                                title="Revoke Access"
                              >
                                <X size={18} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile List */}
          <div className="md:hidden divide-y divide-white/5">
            {profiles
              .filter(p => p.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map(profile => (
                <div key={profile.id} className={cn(
                  "p-6 space-y-4",
                  !profile.is_approved && "bg-yellow-500/5"
                )}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-lg tracking-tight">{profile.full_name}</div>
                      <div className="text-[10px] text-white/20 uppercase tracking-widest">{profile.phone_number || 'No Phone'}</div>
                    </div>
                    {!profile.is_approved ? (
                      <span className="text-[10px] bg-yellow-500 text-black px-2 py-1 rounded font-black uppercase">Pending</span>
                    ) : (
                      <span className="text-[10px] bg-pitch/20 text-pitch px-2 py-1 rounded font-black uppercase">Active</span>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {!profile.is_approved ? (
                      <button 
                        onClick={() => approveUser(profile.id)}
                        disabled={approvingId === profile.id}
                        className="w-full bg-pitch text-black px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-pitch-dark transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {approvingId === profile.id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Check size={14} />
                        )}
                        {approvingId === profile.id ? 'Approving...' : 'Approve Player'}
                      </button>
                    ) : (
                      <div className="w-full space-y-2">
                        {togglingAdminId === profile.id ? (
                          <div className="flex flex-col gap-2 bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20">
                            <span className="text-[10px] font-bold text-yellow-500 uppercase text-center">Confirm Access Change?</span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => toggleAdmin(profile.id, profile.is_admin)}
                                className="flex-1 bg-pitch text-black px-3 py-2 rounded-lg text-xs font-bold"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setTogglingAdminId(null)}
                                className="flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-xs font-bold"
                              >
                                No
                              </button>
                            </div>
                          </div>
                        ) : deletingProfileId === profile.id ? (
                          <div className="flex flex-col gap-2 bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                            <span className="text-[10px] font-bold text-red-500 uppercase text-center">Revoke Access?</span>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => revokeAccess(profile.id)}
                                className="flex-1 bg-red-500 text-white px-3 py-2 rounded-lg text-xs font-bold"
                              >
                                Yes
                              </button>
                              <button 
                                onClick={() => setDeletingProfileId(null)}
                                className="flex-1 bg-white/10 text-white px-3 py-2 rounded-lg text-xs font-bold"
                              >
                                No
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setTogglingAdminId(profile.id)}
                              className={cn(
                                "flex-1 px-4 py-3 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2",
                                profile.is_admin 
                                  ? "bg-pitch/10 text-pitch border border-pitch/20" 
                                  : "bg-white/5 text-white/40 border border-white/10"
                              )}
                            >
                              <Shield size={14} />
                              {profile.is_admin ? 'Admin' : 'Make Admin'}
                            </button>
                            <button 
                              onClick={() => setDeletingProfileId(profile.id)}
                              className="bg-white/5 text-white/20 px-4 py-3 rounded-xl border border-white/10"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
