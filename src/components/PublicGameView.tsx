import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, RSVP, Profile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Clock, Trophy, CheckCircle2, Shuffle, Loader2, BarChart3, Users, ExternalLink, Check, RotateCw, X, Frown } from 'lucide-react';
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
  const [mspVotes, setMspVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<Profile | null>(null);
  const [rsvpMessage, setRsvpMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

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

  const fetchMspVotes = async () => {
    const { data, error } = await supabase
      .from('msp_votes')
      .select('*')
      .eq('game_id', gameId);

    if (error) {
      console.warn('Error fetching msp_votes (table might need to be created):', error);
      return;
    }
    if (data) setMspVotes(data);
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
      await Promise.all([fetchRSVPs(), fetchVotes(), fetchMspVotes()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRSVPAction = async (going: boolean) => {
    if (!currentUser) {
      window.location.href = '/';
      return;
    }

    if (currentUserProfile && !currentUserProfile.is_approved) {
      setRsvpMessage({ type: 'error', text: 'Your account is pending approval by an admin.' });
      return;
    }

    setActionLoading(true);
    setRsvpMessage(null);
    try {
      // Fetch fresh data to avoid stale state issues
      const { data: currentRSVPs, error: fetchError } = await supabase
        .from('rsvps')
        .select('*, profiles(*)')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      
      const latestRSVPs = currentRSVPs || [];
      const existingRSVP = latestRSVPs.find(r => r.user_id === currentUser.id);
      
      if (going) {
        // Handle "I'M IN"
        if (existingRSVP && (existingRSVP.status === 'confirmed' || existingRSVP.status === 'waiting')) {
          setRsvpMessage({ type: 'success', text: "You're already on the squad!" });
          return;
        }

        const confirmedCount = latestRSVPs.filter((r: any) => r.status === 'confirmed').length;
        const newStatus = confirmedCount < 22 ? 'confirmed' : 'waiting';

        if (existingRSVP) {
          const { error: updateError } = await supabase
            .from('rsvps')
            .update({ status: newStatus, created_at: new Date().toISOString() })
            .eq('id', existingRSVP.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('rsvps').insert({
            game_id: gameId,
            user_id: currentUser.id,
            status: newStatus
          });
          if (insertError) throw insertError;
        }
        setRsvpMessage({ type: 'success', text: newStatus === 'confirmed' ? "Awesome! You are confirmed for this match." : 'You have been added to the waiting list.' });
      } else {
        // Handle "I'M OUT"
        if (existingRSVP && existingRSVP.status === 'declined') {
          setRsvpMessage({ type: 'success', text: "You've already declined." });
          return;
        }

        const wasConfirmed = existingRSVP?.status === 'confirmed';

        // Try to update to 'declined'. If this fails due to DB constraint, fallback to delete.
        const { error: updateError } = await (existingRSVP 
          ? supabase.from('rsvps').update({ status: 'declined' }).eq('id', existingRSVP.id)
          : supabase.from('rsvps').insert({ game_id: gameId, user_id: currentUser.id, status: 'declined' }));

        if (updateError) {
          if (updateError.message.includes('violates check constraint') || updateError.message.includes('check constraint "rsvps_status_check"')) {
            // Fallback: If 'declined' isn't supported, just delete the entry (old behavior)
            if (existingRSVP) {
              const { error: deleteError } = await supabase.from('rsvps').delete().eq('id', existingRSVP.id);
              if (deleteError) throw deleteError;
              setRsvpMessage({ type: 'success', text: 'Successfully withdrew your RSVP.' });
            } else {
              setRsvpMessage({ type: 'success', text: 'Already out.' });
            }
          } else {
            throw updateError;
          }
        } else {
          setRsvpMessage({ type: 'success', text: 'Successfully cancelled/declined your RSVP.' });
        }

        // Manual Promotion: If a confirmed player withdraws, promote the first waiting player
        if (wasConfirmed && game?.status === 'open') {
          const firstWaiting = latestRSVPs.find((r: any) => r.status === 'waiting');
          if (firstWaiting) {
            await supabase.from('rsvps').update({ status: 'confirmed' }).eq('id', firstWaiting.id);
          }
        }
      }
      
      await fetchRSVPs();
      setTimeout(() => setRsvpMessage(null), 5000);
    } catch (err: any) {
      setRsvpMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user);
      if (user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
          .then(({ data }) => {
            if (data) setCurrentUserProfile(data);
          });
      }
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
      }, () => {
        fetchVotes();
      })
      .subscribe();

    const mspVoteSubscription = supabase
      .channel(`public_msp_votes_${gameId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'msp_votes',
        filter: `game_id=eq.${gameId}`
      }, () => {
        fetchMspVotes();
      })
      .subscribe();

    return () => {
      rsvpSubscription.unsubscribe();
      gameSubscription.unsubscribe();
      voteSubscription.unsubscribe();
      mspVoteSubscription.unsubscribe();
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

    // Eligibility check: Only confirmed players can vote
    const isPlayerConfirmed = confirmed.some(r => r.user_id === currentUser.id);
    if (!isPlayerConfirmed) {
      alert('Only players confirmed for this match can vote!');
      return;
    }

    // Cannot vote for self
    if (candidateId === currentUser.id) {
      alert('You cannot vote for yourself!');
      return;
    }

    // Cannot vote for same candidate as MSP
    const myMspVote = mspVotes.find(v => v.voter_id === currentUser.id);
    if (myMspVote && myMspVote.candidate_id === candidateId) {
      alert('You cannot vote for your MSP choice as MVP!');
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

  const handleMspVote = async (candidateId: string) => {
    if (!currentUser) {
      alert('Please log in to cast your vote!');
      window.location.href = '/';
      return;
    }

    if (game?.status !== 'voting') {
      alert('Voting is not open yet!');
      return;
    }

    // Eligibility check: Only confirmed players can vote
    const isPlayerConfirmed = confirmed.some(r => r.user_id === currentUser.id);
    if (!isPlayerConfirmed) {
      alert('Only players confirmed for this match can vote!');
      return;
    }

    // Cannot vote for self
    if (candidateId === currentUser.id) {
      alert('You cannot vote for yourself!');
      return;
    }

    // Cannot vote for same candidate as MVP
    if (myVote && myVote.candidate_id === candidateId) {
      alert('You cannot vote for your MVP choice as the Most Shitty Player!');
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.from('msp_votes').insert({
        game_id: gameId,
        voter_id: currentUser.id,
        candidate_id: candidateId
      });
      if (error) throw error;
      fetchMspVotes();
    } catch (err: any) {
      alert(err.code === '23505' ? 'You have already voted for MSP!' : err.message);
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
  const declined = rsvps.filter(r => r.status === 'declined');
  const myVote = votes.find(v => v.voter_id === currentUser?.id);
  const myMspVote = mspVotes.find(v => v.voter_id === currentUser?.id);

  const getVoteCount = (playerId: string) => votes.filter(v => v.candidate_id === playerId).length;
  const maxVotes = Math.max(...confirmed.map(p => getVoteCount(p.user_id)), 1);

  const getMspVoteCount = (playerId: string) => mspVotes.filter(v => v.candidate_id === playerId).length;

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
          {!currentUser ? (
            <button 
              onClick={() => window.location.href = '/'}
              className="text-[10px] font-black uppercase tracking-widest bg-white text-black px-4 py-1.5 rounded-full hover:bg-white/90 transition-all font-bold"
            >
              Login to RSVP
            </button>
          ) : (
            <button 
              onClick={() => window.location.href = '/'}
              className="text-[10px] font-black uppercase tracking-widest bg-white/10 text-white hover:bg-white/20 border border-white/20 px-4 py-1.5 rounded-full transition-all font-bold"
            >
              Go to App
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
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${game.location}, Perth WA`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/60 hover:text-pitch transition-colors hover:underline group"
                title="Click to navigate on Google Maps"
              >
                <MapPin size={16} className="group-hover:text-pitch transition-colors text-white" /> 
                <span className="group-hover:text-pitch transition-colors">{game.location}</span>
              </a>
              <div className="flex items-center gap-2"><Clock size={16} /> {formatTime(game.time)}</div>
              <div className="flex items-center gap-2"><Users size={16} /> {confirmed.length} Confirmed</div>
            </div>
          </div>

          {/* Winner Display Cards */}
          {(game.mvp_winner || game.msp_winner) && (
            <div className="flex flex-col md:flex-row lg:flex-col gap-4 w-full">
              {game.mvp_winner && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white text-black p-6 rounded-3xl flex flex-col items-center text-center space-y-2 shadow-[0_0_50px_rgba(255,255,255,0.2)] flex-1"
                >
                  <Trophy size={36} className="text-blue-600 animate-bounce" />
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-50">Match MVP</p>
                    <h2 className="text-2xl font-black italic tracking-tighter">{game.mvp_winner.toUpperCase()}</h2>
                  </div>
                </motion.div>
              )}
              {game.msp_winner && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-red-500/15 text-red-500 p-6 rounded-3xl flex flex-col items-center text-center space-y-2 border border-red-500/30 shadow-[0_0_50px_rgba(239,68,68,0.1)] flex-1"
                >
                  <Frown size={36} className="text-red-500 animate-pulse" />
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-50 text-red-400">Match MSP</p>
                    <h2 className="text-2xl font-black italic tracking-tighter text-white">{game.msp_winner.toUpperCase()}</h2>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Dynamic RSVP Action Card */}
        {game.status === 'open' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 md:p-8 rounded-3xl border border-white/10 bg-white/5 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1.5 h-full bg-pitch" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-xs font-black tracking-widest text-pitch uppercase mb-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pitch animate-pulse" />
                  Your Match Participation
                </h3>
                {currentUser ? (
                  <div className="space-y-1">
                    <p className="text-xl font-bold">
                      Hello, {currentUserProfile?.full_name || currentUser.email?.split('@')[0]}!
                    </p>
                    <p className="text-sm text-white/60">
                      {(() => {
                        const myRSVP = rsvps.find(r => r.user_id === currentUser.id);
                        if (!myRSVP) return "You haven't registered your status for this match yet.";
                        if (myRSVP.status === 'confirmed') return "🎉 You are CONFIRMED in the squad!";
                        if (myRSVP.status === 'waiting') return "⏳ You are currently on the WAITING list.";
                        return "❌ You are listed as DECLINED (OUT).";
                      })()}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-lg font-bold">Confirm your spot for Tuesday</p>
                    <p className="text-sm text-white/40">Log in to RSVP, join the squad, or update your status instantly.</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {currentUser ? (
                  <div className="flex flex-wrap gap-3">
                    {(() => {
                      const myRSVP = rsvps.find(r => r.user_id === currentUser.id);
                      const isConfirmed = myRSVP?.status === 'confirmed';
                      const isWaiting = myRSVP?.status === 'waiting';
                      const isDeclined = myRSVP?.status === 'declined';
                      
                      return (
                        <>
                          <button
                            onClick={() => handleRSVPAction(true)}
                            disabled={actionLoading}
                            className={cn(
                              "text-xs font-black uppercase tracking-wider px-6 py-3 rounded-xl transition-all flex items-center gap-2",
                              (isConfirmed || isWaiting)
                                ? "bg-pitch text-black font-extrabold cursor-default pointer-events-none"
                                : "bg-white/5 border border-white/10 text-white hover:border-pitch hover:text-pitch cursor-pointer"
                            )}
                          >
                            {actionLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "I'm IN ⚽"}
                          </button>
                          
                          {showConfirmCancel ? (
                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 p-1.5 rounded-xl">
                              <span className="text-[10px] text-red-400 font-bold px-1 uppercase tracking-tight">Are you sure?</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  setShowConfirmCancel(false);
                                  await handleRSVPAction(false);
                                }}
                                disabled={actionLoading}
                                className="bg-red-500 text-white text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg hover:bg-red-600 transition-all cursor-pointer"
                              >
                                CONFIRM OUT ❌
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowConfirmCancel(false)}
                                className="bg-white/10 text-white text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg hover:bg-white/20 transition-all cursor-pointer"
                              >
                                Keep Spot ⚽
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                const myRSVP = rsvps.find(r => r.user_id === currentUser.id);
                                if (myRSVP && (myRSVP.status === 'confirmed' || myRSVP.status === 'waiting')) {
                                  setShowConfirmCancel(true);
                                } else {
                                  handleRSVPAction(false);
                                }
                              }}
                              disabled={actionLoading}
                              className={cn(
                                "text-xs font-black uppercase tracking-wider px-6 py-3 rounded-xl transition-all flex items-center gap-2",
                                isDeclined
                                  ? "bg-red-500 text-white font-extrabold cursor-default pointer-events-none"
                                  : "bg-white/5 border border-white/10 text-white hover:border-red-500 hover:text-red-500 cursor-pointer"
                              )}
                            >
                              {actionLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "I'm OUT ❌"}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <button
                    onClick={() => window.location.href = '/'}
                    className="bg-white text-black text-xs font-black uppercase tracking-widest px-6 py-3 rounded-xl hover:bg-white/90 transition-all flex items-center gap-2 font-bold cursor-pointer"
                  >
                    Sign-In to RSVP <ExternalLink size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Notification message banner */}
            {rsvpMessage && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={cn(
                  "mt-4 p-3 rounded-lg text-xs font-bold border",
                  rsvpMessage.type === 'success' 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                )}
              >
                {rsvpMessage.text}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Live MVP & MSP Voting Sections OR Player Lists */}
        <AnimatePresence mode="wait">
          {(game.status === 'voting' || game.status === 'finished') ? (
            <motion.section 
              key="voting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* MVP Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-blue-500/20 pb-4">
                    <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3 text-blue-500">
                      <BarChart3 /> 
                      {game.status === 'finished' ? 'FINAL MVP RESULTS' : 'LIVE MVP VOTING'}
                    </h3>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {votes.length} Total Votes
                    </div>
                  </div>

                  <div className="space-y-3">
                    {confirmed
                      .sort((a, b) => getVoteCount(b.user_id) - getVoteCount(a.user_id))
                      .slice(0, 10)
                      .map((player, idx) => {
                        const voteCount = getVoteCount(player.user_id);
                        const isVotedByMe = myVote?.candidate_id === player.user_id;
                        const isSelfCandidate = player.user_id === currentUser?.id;
                        const isMspCandidate = myMspVote?.candidate_id === player.user_id;
                        const canCastVote = game.status === 'voting' && !myVote && currentUser && !isSelfCandidate && !isMspCandidate;

                        return (
                          <div
                            key={player.id}
                            className={cn(
                              "relative p-5 rounded-2xl border transition-all overflow-hidden",
                              isVotedByMe ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]" : "bg-white/5 border-white/10"
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

                            <div className="relative flex items-center justify-between z-10">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black italic opacity-30">#{idx + 1}</span>
                                <span className="font-bold tracking-tight">{player.profiles?.full_name || 'Unknown Player'}</span>
                                {isSelfCandidate && <span className="text-[9px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-white/40">You</span>}
                                {isMspCandidate && <span className="text-[9px] uppercase bg-red-500/10 px-1.5 py-0.5 rounded text-red-500 font-extrabold">Your MSP choice</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black">{voteCount} {voteCount === 1 ? 'vote' : 'votes'}</span>
                                {canCastVote && (
                                  <button 
                                    onClick={() => handleVote(player.user_id)}
                                    disabled={actionLoading}
                                    className="bg-blue-500 text-white p-1.5 rounded-lg hover:bg-blue-600 transition-all"
                                    title="Vote MVP"
                                  >
                                    <Check size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {confirmed.length === 0 && (
                      <p className="text-white/20 italic text-sm">No players confirmed for this match.</p>
                    )}
                  </div>
                </div>

                {/* MSP Section */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-red-500/20 pb-4">
                    <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3 text-red-500">
                      <Frown /> 
                      {game.status === 'finished' ? 'FINAL MSP RESULTS' : 'LIVE MSP VOTING'}
                    </h3>
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {mspVotes.length} Total Votes
                    </div>
                  </div>

                  <div className="space-y-3">
                    {confirmed
                      .sort((a, b) => getMspVoteCount(b.user_id) - getMspVoteCount(a.user_id))
                      .slice(0, 10)
                      .map((player, idx) => {
                        const mspVoteCount = getMspVoteCount(player.user_id);
                        const isVotedByMe = myMspVote?.candidate_id === player.user_id;
                        const isSelfCandidate = player.user_id === currentUser?.id;
                        const isMvpCandidate = myVote?.candidate_id === player.user_id;
                        const canCastMspVote = game.status === 'voting' && !myMspVote && currentUser && !isSelfCandidate && !isMvpCandidate;

                        const maxMspVotes = Math.max(...confirmed.map(p => getMspVoteCount(p.user_id)), 1);

                        return (
                          <div
                            key={player.id}
                            className={cn(
                              "relative p-5 rounded-2xl border transition-all overflow-hidden",
                              isVotedByMe ? "bg-white text-black border-white shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "bg-white/5 border-white/10"
                            )}
                          >
                            {/* Progress Bar */}
                            <div 
                              className={cn(
                                "absolute inset-0 transition-all duration-1000 opacity-10",
                                isVotedByMe ? "bg-black" : "bg-red-500"
                              )}
                              style={{ width: `${(mspVoteCount / maxMspVotes) * 100}%` }}
                            />

                            <div className="relative flex items-center justify-between z-10">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-black italic opacity-30">#{idx + 1}</span>
                                <span className="font-bold tracking-tight">{player.profiles?.full_name || 'Unknown Player'}</span>
                                {isSelfCandidate && <span className="text-[9px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-white/40">You</span>}
                                {isMvpCandidate && <span className="text-[9px] uppercase bg-blue-500/10 px-1.5 py-0.5 rounded text-blue-400 font-extrabold">Your MVP choice</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black">{mspVoteCount} {mspVoteCount === 1 ? 'vote' : 'votes'}</span>
                                {canCastMspVote && (
                                  <button 
                                    onClick={() => handleMspVote(player.user_id)}
                                    disabled={actionLoading}
                                    className="bg-red-500 text-white p-1.5 rounded-lg hover:bg-red-600 transition-all"
                                    title="Vote MSP"
                                  >
                                    <Check size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {confirmed.length === 0 && (
                      <p className="text-white/20 italic text-sm">No players confirmed for this match.</p>
                    )}
                  </div>
                </div>
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

              {declined.length > 0 && (
                <div className="space-y-6 pt-12 border-t border-white/5">
                  <h3 className="text-2xl font-black italic tracking-tighter flex items-center gap-3 text-highlight/40">
                    <X size={24} /> DECLINED (OUT)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {declined.map((rsvp, i) => (
                      <div key={rsvp.id} className="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-highlight/10 opacity-30">
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
