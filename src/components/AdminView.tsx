import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, Profile } from '../types';
import { motion } from 'motion/react';
import { Plus, Users, Shield, Trash2, Check, X, Copy, Flag, Share2, Trophy, Loader2, RotateCw, Frown } from 'lucide-react';
import { cn, formatDate, formatTime } from '../lib/utils';

export default function AdminView() {
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGameDate, setNewGameDate] = useState('');
  const [newGameTime, setNewGameTime] = useState('18:45');
  const [newGameLocation, setNewGameLocation] = useState('Rivervale');
  const [hasInitializedForm, setHasInitializedForm] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setStatusMessage(prev => prev?.text === text ? null : prev);
    }, 10000); // Display for 10 seconds so the user can easily read and debug
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [togglingAdminId, setTogglingAdminId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);

  const [approvingId, setApprovingId] = useState<string | null>(null);

  const getNextWeekDateString = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + 7);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    } catch (e) {
      return '';
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gamesRes, profilesRes] = await Promise.all([
        supabase.from('games').select('*').order('date', { ascending: false }),
        supabase.from('profiles').select('*').order('full_name', { ascending: true })
      ]);

      if (gamesRes.error) {
        showStatus('error', 'Error loading games: ' + gamesRes.error.message);
      } else if (gamesRes.data) {
        setGames(gamesRes.data);
        
        // Auto-prefill the creation form on initial load
        if (!hasInitializedForm) {
          if (gamesRes.data.length > 0) {
            const lastGame = gamesRes.data[0];
            setNewGameLocation(lastGame.location);
            setNewGameTime(lastGame.time);
            const nextDate = getNextWeekDateString(lastGame.date);
            if (nextDate) {
              setNewGameDate(nextDate);
            }
          } else {
            // Defaults if no games exist
            setNewGameLocation('Rivervale (Copley Park)');
            setNewGameTime('18:45');
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            setNewGameDate(`${y}-${m}-${d}`);
          }
          setHasInitializedForm(true);
        }
      }
      
      if (profilesRes.error) {
        showStatus('error', 'Error loading profiles: ' + profilesRes.error.message);
      } else if (profilesRes.data) {
        setProfiles(profilesRes.data.map((p: any) => ({
          ...p,
          is_approved: p.is_approved ?? true
        })));
      }
    } catch (err: any) {
      console.error('fetchData error:', err);
      showStatus('error', 'Network/database error during fetch: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const activeGames = games.filter(g => g.status !== 'finished');
  const historyGames = games.filter(g => g.status === 'finished');
  const activeGame = activeGames[0]; // There should only be one active game based on our logic

  const createGame = async (copyPrevious = false) => {
    if (activeGame) {
      showStatus('error', 'Only one active match can exist at a time. Please finish or delete the current match first.');
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
      showStatus('error', 'Please select a date for the new match.');
      return;
    }

    try {
      const { error } = await supabase.from('games').insert(gameData);
      if (error) {
        showStatus('error', 'Could not create match: ' + error.message);
      } else {
        showStatus('success', 'Match created successfully!');
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error creating match: ' + (err.message || err));
    }
  };
  
  const copyPublicLink = (game: Game) => {
    try {
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
      showStatus('success', 'WhatsApp share message copied to clipboard!\n\n' + shareText);
    } catch (err: any) {
      showStatus('error', 'Error copying link: ' + (err.message || err));
    }
  };

  const toggleAdmin = async (profileId: string, currentStatus: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === profileId && currentStatus) {
        showStatus('error', 'You cannot remove your own admin status to prevent lockout.');
        return;
      }

      console.log('Toggling admin for:', profileId, 'from:', currentStatus);
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentStatus })
        .eq('id', profileId);
      
      if (error) {
        showStatus('error', 'Could not toggle admin: ' + error.message);
      } else {
        showStatus('success', 'Admin privileges updated successfully.');
        setTogglingAdminId(null);
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error: ' + (err.message || err));
    }
  };

  const drawTeams = async (gameId: string) => {
    try {
      const { data: rsvpsData, error: fetchErr } = await supabase
        .from('rsvps')
        .select('*')
        .eq('game_id', gameId)
        .eq('status', 'confirmed');

      if (fetchErr) {
        showStatus('error', 'Error fetching RSVPs: ' + fetchErr.message);
        return;
      }

      if (!rsvpsData || rsvpsData.length < 2) {
        showStatus('error', 'Not enough players to draw teams (minimum 2 players confirmed).');
        return;
      }

      const userIds = rsvpsData.map(r => r.user_id);
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profilesErr) {
        showStatus('error', 'Error fetching profiles for RSVPs: ' + profilesErr.message);
        return;
      }

      const profilesMap = new Map((profilesData || []).map(p => [p.id, p]));
      const playing = rsvpsData
        .map(r => profilesMap.get(r.user_id))
        .filter(Boolean) as any[];

      const shuffled = [...playing].sort(() => Math.random() - 0.5);
      const mid = Math.ceil(shuffled.length / 2);
      const teamA = shuffled.slice(0, mid);
      const teamB = shuffled.slice(mid);

      const { error } = await supabase
        .from('games')
        .update({ team_a: teamA, team_b: teamB })
        .eq('id', gameId);

      if (error) {
        showStatus('error', 'Could not save drawn teams: ' + error.message);
      } else {
        showStatus('success', 'Teams drawn and saved successfully!');
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error drawing teams: ' + (err.message || err));
    }
  };

  const updateGameStatus = async (gameId: string, status: string) => {
    try {
      let updateData: any = { status };
      
      if (status === 'finished') {
        // Safe calculative blocks
        try {
          // Calculate MVP
          const { data: votes, error: votesError } = await supabase
            .from('votes')
            .select('candidate_id')
            .eq('game_id', gameId);
          
          if (votesError) {
            console.warn('Error fetching MVP votes on finish:', votesError.message);
          }
          
          if (votes && votes.length > 0) {
            const counts: Record<string, number> = {};
            votes.forEach(v => {
              if (v.candidate_id) {
                counts[v.candidate_id] = (counts[v.candidate_id] || 0) + 1;
              }
            });
            const sortedCounts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (sortedCounts.length > 0) {
              const winnerId = sortedCounts[0][0];
              const winner = profiles.find(p => p.id === winnerId);
              if (winner) {
                updateData.mvp_winner = winner.full_name;
              } else {
                // Direct database fallback lookup
                const { data: pData } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', winnerId)
                  .single();
                if (pData) {
                  updateData.mvp_winner = pData.full_name;
                } else {
                  updateData.mvp_winner = `Player (${winnerId.slice(0, 5)})`;
                }
              }
            }
          }
        } catch (mvpErr: any) {
          console.error('Safe MVP calculation caught error:', mvpErr);
        }

        try {
          // Calculate MSP
          const { data: mspVotes, error: mspError } = await supabase
            .from('msp_votes')
            .select('candidate_id')
            .eq('game_id', gameId);

          if (mspError) {
            console.warn('Error fetching MSP votes on finish:', mspError.message);
          }

          if (mspVotes && mspVotes.length > 0) {
            const mspCounts: Record<string, number> = {};
            mspVotes.forEach(v => {
              if (v.candidate_id) {
                mspCounts[v.candidate_id] = (mspCounts[v.candidate_id] || 0) + 1;
              }
            });
            const sortedMspCounts = Object.entries(mspCounts).sort((a, b) => b[1] - a[1]);
            if (sortedMspCounts.length > 0) {
              const mspWinnerId = sortedMspCounts[0][0];
              const mspWinner = profiles.find(p => p.id === mspWinnerId);
              if (mspWinner) {
                updateData.msp_winner = mspWinner.full_name;
              } else {
                // Direct database fallback lookup
                const { data: pData } = await supabase
                  .from('profiles')
                  .select('full_name')
                  .eq('id', mspWinnerId)
                  .single();
                if (pData) {
                  updateData.msp_winner = pData.full_name;
                } else {
                  updateData.msp_winner = `Player (${mspWinnerId.slice(0, 5)})`;
                }
              }
            }
          }
        } catch (mspErr: any) {
          console.error('Safe MSP calculation caught error:', mspErr);
        }
      }

      console.log('Sending games update:', updateData);
      let { error } = await supabase.from('games').update(updateData).eq('id', gameId);
      
      // Fallback: If it failed due to missing msp_winner or mvp_winner column, retry without them
      if (error && (error.message?.includes('msp_winner') || error.message?.includes('mvp_winner') || error.code === 'PGRST204')) {
        console.log('Detected missing winner columns, retrying update with only status...');
        const fallbackData = { status };
        const res = await supabase.from('games').update(fallbackData).eq('id', gameId);
        error = res.error;
      }

      if (error) {
        showStatus('error', `Could not update match status: ${error.message}`);
      } else {
        showStatus('success', `Match status updated successfully to ${status}!`);
        await fetchData();
      }
    } catch (err: any) {
      console.error('Fatal error in updateGameStatus:', err);
      showStatus('error', `A critical error occurred: ${err.message || err}`);
    }
  };

  const copyMVPPoll = (game: Game) => {
    try {
      const appUrl = window.location.origin;
      const pollText = `🏆 *MVP VOTING: ${game.date}*\n\nVote for the best player of the match here:\n${appUrl}\n\n_Only confirmed players can vote!_`;
      
      navigator.clipboard.writeText(pollText);
      showStatus('success', 'MVP voting WhatsApp poll template copied to clipboard!');
    } catch (err: any) {
      showStatus('error', 'Error copying MVP poll template: ' + (err.message || err));
    }
  };

  const copyMSPPoll = (game: Game) => {
    try {
      const appUrl = window.location.origin;
      const pollText = `💩 *MSP VOTING (Most Shitty Player): ${game.date}*\n\nVote for the MSP of the match here:\n${appUrl}\n\n_Only confirmed players can vote!_`;
      
      navigator.clipboard.writeText(pollText);
      showStatus('success', 'MSP voting WhatsApp poll template copied to clipboard!');
    } catch (err: any) {
      showStatus('error', 'Error copying MSP poll template: ' + (err.message || err));
    }
  };

  const deleteGame = async (gameId: string) => {
    try {
      const { error } = await supabase.from('games').delete().eq('id', gameId);
      if (error) {
        showStatus('error', 'Could not delete match: ' + error.message);
      } else {
        showStatus('success', 'Match deleted successfully.');
        setDeletingGameId(null);
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error deleting match: ' + (err.message || err));
    }
  };

  const approveUser = async (profileId: string) => {
    setApprovingId(profileId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: true })
        .eq('id', profileId);
      
      if (error) {
        showStatus('error', `Could not approve player: ${error.message}`);
      } else {
        showStatus('success', 'Player approved successfully.');
        setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, is_approved: true } : p));
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error approving player: ' + (err.message || err));
    } finally {
      setApprovingId(null);
    }
  };

  const revokeAccess = async (profileId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id === profileId) {
        showStatus('error', 'You cannot revoke your own admin access privileges.');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: false })
        .eq('id', profileId);
      
      if (error) {
        showStatus('error', 'Could not revoke access: ' + error.message);
      } else {
        showStatus('success', 'Player access revoked successfully.');
        setDeletingProfileId(null);
        fetchData();
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error revoking access: ' + (err.message || err));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch"></div></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="space-y-4">
        <h1 className="text-5xl font-black tracking-tighter text-pitch italic">ADMIN PANEL</h1>
        <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Manage games, players and polls.</p>
      </div>

      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-xl border flex items-start gap-3",
            statusMessage.type === 'error' 
              ? "bg-red-500/10 border-red-500/20 text-red-400" 
              : "bg-[#00ff66]/10 border-[#00ff66]/20 text-[#00ff66]"
          )}
        >
          <div className="flex-1 text-sm font-bold whitespace-pre-line">{statusMessage.text}</div>
          <button onClick={() => setStatusMessage(null)} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </motion.div>
      )}

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
          <div className="glass-card p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs text-white/40 uppercase font-bold">Location</label>
                <input 
                  type="text" 
                  value={newGameLocation}
                  onChange={e => setNewGameLocation(e.target.value)}
                  placeholder="e.g. Rivervale (Copley Park)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2 focus:border-pitch outline-none" 
                />
              </div>
            </div>

            {/* Quick Presets Selection Buttons */}
            <div className="border-t border-white/5 pt-4 space-y-2">
              <label className="text-xs text-white/40 uppercase font-bold block">Quick Actions</label>
              <div className="flex flex-wrap gap-2">
                {games.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const last = games[0];
                      setNewGameLocation(last.location);
                      setNewGameTime(last.time);
                      const nextDate = getNextWeekDateString(last.date);
                      if (nextDate) setNewGameDate(nextDate);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-1 font-bold"
                  >
                    🔄 Autofill Next Week Match
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end border-t border-white/5 pt-4">
              <button 
                onClick={() => createGame()}
                className="bg-pitch text-black font-black py-3 px-8 rounded-xl hover:bg-pitch-dark transition-all uppercase tracking-wider text-sm flex items-center gap-2"
              >
                <Plus size={16} /> Create Game
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
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to finish this match directly? This will end the game immediately and skip the MVP & MSP voting phase.')) {
                          updateGameStatus(game.id, 'finished');
                        }
                      }} 
                      className="bg-highlight/10 text-highlight px-4 py-2 rounded-xl text-xs font-bold hover:bg-highlight/20 transition-all flex items-center gap-2"
                    >
                      <Check size={14} /> Finish Match
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
                      <Trophy size={14} /> Start MVP & MSP Voting
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to finish this match directly? This will end the game immediately and skip the MVP & MSP voting phase.')) {
                          updateGameStatus(game.id, 'finished');
                        }
                      }} 
                      className="bg-highlight/10 text-highlight px-4 py-2 rounded-xl text-xs font-bold hover:bg-highlight/20 transition-all flex items-center gap-2"
                    >
                      <Check size={14} /> Finish Match
                    </button>
                  </>
                )}

                {game.status === 'voting' && (
                  <>
                    <button 
                      onClick={() => copyMVPPoll(game)} 
                      className="bg-blue-500/10 text-blue-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-500/20 transition-all flex items-center gap-2"
                    >
                      <Trophy size={14} /> Copy MVP Poll
                    </button>
                    <button 
                      onClick={() => copyMSPPoll(game)} 
                      className="bg-red-500/10 text-red-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all flex items-center gap-2"
                    >
                      <Frown size={14} /> Copy MSP Poll
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
                  {game.location} • MVP: {game.mvp_winner || 'N/A'} • MSP: {game.msp_winner || 'N/A'}
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => {
                    if (window.confirm('Do you want to reopen this match for MVP & MSP Voting?')) {
                      updateGameStatus(game.id, 'voting');
                    }
                  }}
                  className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5"
                  title="Reopen match and allow players to vote again"
                >
                  <RotateCw size={12} /> Reopen Voting
                </button>
                <button 
                  onClick={() => {
                    if (window.confirm('Do you want to move this match back to RSVP Open?')) {
                      updateGameStatus(game.id, 'open');
                    }
                  }}
                  className="bg-white/5 text-white/60 hover:bg-white/10 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all flex items-center gap-1.5"
                  title="Set match status back to RSVP Open"
                >
                  <RotateCw size={12} /> RSVP Open
                </button>

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
