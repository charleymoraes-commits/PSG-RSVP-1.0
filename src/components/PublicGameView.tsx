import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, RSVP, Profile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Clock, Trophy, CheckCircle2, Shuffle, Loader2, BarChart3, Users, ExternalLink, Check, RotateCw } from 'lucide-react';
import { cn, formatTime, formatDate } from '../lib/utils';

interface PublicGameViewProps {
  gameId: string;
}

interface Vote {
  id: string;
  game_id: string;
  voter_id: string;
  candidate_id: string;
}

export default function PublicGameView({ gameId }: PublicGameViewProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRSVPs = async () => {
    const { data, error } = await supabase
      .from('rsvps')
      .select('*, profiles!user_id(*)')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });

    if (error) console.error('Error fetching RSVPs:', error);
    if (data) setRsvps(data as any);
  };

  const fetchVotes = async () => {
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('game_id', gameId);

    if (error) console.error('Error fetching votes:', error);
    if (data) setVotes(data);
  };

  const fetchGameData = async () => {
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

      if (gameError) throw gameError;
      setGame(gameData);
      await Promise.all([fetchRSVPs(), fetchVotes()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
    });

    fetchGameData();

    // Realtime subscriptions
    const rsvpSubscription = supabase
      .channel(`public_rsvps_${gameId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'rsvps',
        filter: `game_id=eq.${gameId}`
      }, () => {
        fetchRSVPs();
      })
      .subscribe();

    const gameSubscription = supabase
      .channel(`public_game_${gameId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'games',
        filter: `id=eq.${gameId}`
      }, (payload) => {
        setGame(payload.new as Game);
      })
      .subscribe();

    const voteSubscription = supabase
      .channel(`public_votes_${gameId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'votes',
        filter: `game_id=eq.${gameId}`
      }, (payload) => {
        console.log('Vote change detected:', payload);
        fetchVotes();
      })
      .subscribe();

    return () => {
      rsvpSubscription.unsubscribe();
      gameSubscription.unsubscribe();
      voteSubscription.unsubscribe();
    };
  }, [gameId]);

  const handleVote = async (candidateId: string) => {
    if (!currentUser) {
      alert('Please log in to cast your vote!');
      window.location.href = '/';
      return;
    }

    if (game?.status !== 'voting') {
      alert('Voting is not open yet!');
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.from('votes').insert({
        game_id: gameId,
        voter_id: currentUser.id,
        candidate_id: candidateId
      });
      if (error) throw error;
      fetchVotes();
    } catch (err: any) {
      alert(err.code === '23505' ? 'You have already voted!' : err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-white" size={48} />
        <p className="text-white/40 font-black tracking-widest text-xs uppercase">Entering Match Centre...</p>
      </div>
    </div>
  );

  if (error || !game) return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white/40 italic tracking-tighter">MATCH NOT FOUND</h1>
        <p className="text-white/20 text-sm">This match might have been deleted or the link is incorrect.</p>
        <button onClick={() => window.location.href = '/'} className="text-white underline text-xs font-bold">Return Home</button>
      </div>
    </div>
  );

  const confirmed = rsvps.filter(r => r.status === 'confirmed');
  const waiting = rsvps.filter(r => r.status === 'waiting');
  const myVote = votes.find(v => v.voter_id === currentUser?.id);

  const getVoteCount = (playerId: string) => votes.filter(v => v.candidate_id === playerId).length;
  const maxVotes = Math.max(...confirmed.map(p => getVoteCount(p.user_id)), 1);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      {/* Top Bar */}
      <div className="bg-white/5 border-b border-white/10 px-6 py-3 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="text-xl font-black italic tracking-tighter">PSG PERTH</div>
          <div className="h-4 w-px bg-white/10 hidden md:block" />
          <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Match Centre Live
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => fetchGameData()}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
            title="Refresh Data"
          >
            <RotateCw size={16} className={cn(loading && "animate-spin")} />
          </button>
          {!currentUser && (
          <button 
            onClick={() => window.location.href = '/'}
            className="text-[10px] font-black uppercase tracking-widest bg-white text-black px-4 py-1.5 rounded-full hover:bg-white/90 transition-all"
          >
            Login to RSVP
          </button>
        )}
      </div>
    </div>

      <div className="max-w-6xl mx-auto p-6 md:p-12 space-y-12">
        {/* Hero Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                  game.status === 'open' ? "bg-white text-black" : 
                  game.status === 'voting' ? "bg-blue-500 text-white" : "bg-yellow-500 text-black"
                )}>
                  {game.status.toUpperCase()}
                </span>
                <span className="text-white/40 text-[10px] font-black uppercase tracking-widest">{formatDate(game.date)}</span>
              </div>
              <h1 className="text-5xl md:text-8xl font-black tracking-tighter italic leading-none">{game.location.toUpperCase()}</h1>
            </div>
            
            <div className="flex flex-wrap gap-8 text-white/60 font-bold uppercase tracking-widest text-xs">
              <div className="flex items-center gap-2"><MapPin size={16} /> {game.location}</div>
              <div className="flex items-center gap-2"><Clock size={16} /> {formatTime(game.time)}</div>
              <div className="flex items-center gap-2"><Users size={16} /> {confirmed.length} Confirmed</div>
            </div>
          </div>

          {game.mvp_winner && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white text-black p-8 rounded-3xl flex flex-col items-center text-center space-y-4 shadow-[0_0_50px_rgba(255,255,255,0.2)]"
            >
              <Trophy size={48} className="text-blue-600" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Match MVP</p>
                <h2 className="text-3xl font-black italic tracking-tighter">{game.mvp_winner.toUpperCase()}</h2>
              </div>
            </motion.div>
          )}
        </div>

        {/* Live MVP Voting Section OR Player Lists */}
        <AnimatePresence mode="wait">
          {(game.status === 'voting' || game.status === 'finished') ? (
            <motion.section 
              key="voting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3">
                  <BarChart3 className="text-blue-500" /> 
                  {game.status === 'finished' ? 'FINAL MVP RESULTS' : 'LIVE MVP VOTING'}
                </h3>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  {votes.length} Total Votes
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {confirmed
                    .sort((a, b) => getVoteCount(b.user_id) - getVoteCount(a.user_id))
                    .slice(0, 6)
                    .map((player, idx) => {
                      const voteCount = getVoteCount(player.user_id);
                      const isVotedByMe = myVote?.candidate_id === player.user_id;

                      return (
                        <motion.div
                          key={player.id}
                          layout
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "relative p-5 rounded-2xl border transition-all overflow-hidden",
                            isVotedByMe ? "bg-white text-black border-white" : "bg-white/5 border-white/10"
                          )}
                        >
                          {/* Progress Bar */}
                          <div 
                            className={cn(
                              "absolute inset-0 transition-all duration-1000 opacity-10",
                              isVotedByMe ? "bg-black" : "bg-blue-500"
                            )}
                            style={{ width: `${(voteCount / maxVotes) * 100}%` }}
                          />

                          <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-black italic opacity-30">#{idx + 1}</span>
                              <span className="font-bold tracking-tight">{player.profiles?.full_name || 'Unknown Player'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black">{voteCount}</span>
                              {game.status === 'voting' && !myVote && currentUser && (
                                <button 
                                  onClick={() => handleVote(player.user_id)}
                                  disabled={actionLoading}
                                  className="bg-blue-500 text-white p-1.5 rounded-lg hover:bg-blue-600 transition-all"
                                >
                                  <Check size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </div>
              
              {game.status === 'voting' && !currentUser && (
                <div className="text-center p-8 bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <p className="text-white/40 text-sm font-bold mb-4">Want to cast your vote? Log in to your player account.</p>
                  <button 
                    onClick={() => window.location.href = '/'}
                    className="bg-white text-black px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white/90 transition-all flex items-center gap-2 mx-auto"
                  >
                    Login to Vote <ExternalLink size={14} />
                  </button>
                </div>
              )}
            </motion.section>
          ) : (
            <motion.div 
              key="squad"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {game.team_a && game.team_a.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3 text-[#00ff66]">
                      <Users size={24} /> TEAM A (GREEN)
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {game.team_a.map((player, i) => (
                        <div key={player.id} className="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-[#00ff66]/10 hover:border-[#00ff66]/30 transition-all group">
                          <div className="flex items-center gap-4">
                            <span className="text-[#00ff66]/20 font-black italic w-6 group-hover:text-[#00ff66]/40 transition-colors">{i + 1}</span>
                            <span className="font-bold tracking-tight">{player.full_name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3 text-orange-500">
                      <Users size={24} /> TEAM B (ORANGE)
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      {game.team_b.map((player, i) => (
                        <div key={player.id} className="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-orange-500/10 hover:border-orange-500/30 transition-all group">
                          <div className="flex items-center gap-4">
                            <span className="text-orange-500/20 font-black italic w-6 group-hover:text-orange-500/40 transition-colors">{i + 1}</span>
                            <span className="font-bold tracking-tight">{player.full_name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3">
                    <CheckCircle2 className="text-white" /> CONFIRMED SQUAD
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {confirmed.map((rsvp, i) => (
                      <div key={rsvp.id} className="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/20 transition-all group">
                        <div className="flex items-center gap-4">
                          <span className="text-white/20 font-black italic w-6 group-hover:text-white/40 transition-colors">{i + 1}</span>
                          <span className="font-bold tracking-tight">{rsvp.profiles?.full_name || 'Unknown Player'}</span>
                        </div>
                        {game.status === 'open' && <div className="w-2 h-2 rounded-full bg-white/20" />}
                      </div>
                    ))}
                    {confirmed.length === 0 && <p className="text-white/10 italic p-4">Waiting for players to join...</p>}
                  </div>
                </div>
              )}

              {waiting.length > 0 && (
                <div className="space-y-6 pt-12 border-t border-white/5">
                  <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3 text-white/40">
                    <Shuffle className="text-white/20" /> WAITING LIST
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {waiting.map((rsvp, i) => (
                      <div key={rsvp.id} className="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-white/5 opacity-40">
                        <div className="flex items-center gap-4">
                          <span className="text-white/20 font-black italic w-6">{i + 1}</span>
                          <span className="font-bold tracking-tight">{rsvp.profiles?.full_name || 'Unknown Player'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="text-center pt-24 border-t border-white/5">
          <div className="text-2xl font-black italic tracking-tighter mb-2">PSG PERTH</div>
          <p className="text-white/20 text-[10px] uppercase font-black tracking-[0.4em]">
            Official Match Centre &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
