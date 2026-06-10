import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, RSVP, Profile, Vote as VoteType, MSPVote } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, MapPin, Clock, Trophy, Shuffle, CheckCircle2, AlertCircle, ShieldAlert, Loader2, Vote as VoteIcon, Check, RotateCw, X, Frown } from 'lucide-react';
import { cn, formatDate, formatTime, formatRsvpTime } from '../lib/utils';

interface MatchViewProps {
  user: any;
  profile: Profile | null;
  onGoToAdmin: () => void;
}

export default function MatchView({ user, profile, onGoToAdmin }: MatchViewProps) {
  const [nextGame, setNextGame] = useState<Game | null>(null);
  const [rsvps, setRsvps] = useState<RSVP[]>([]);
  const [votes, setVotes] = useState<VoteType[]>([]);
  const [mspVotes, setMspVotes] = useState<MSPVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  useEffect(() => {
    fetchNextGame();
    
    const gameSubscription = supabase
      .channel('game_changes')
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'games' }, () => fetchNextGame())
      .subscribe();

    const rsvpSubscription = supabase
      .channel('rsvp_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rsvps' }, () => fetchRSVPs())
      .subscribe();

    const voteSubscription = supabase
      .channel('vote_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => fetchVotes())
      .subscribe();

    const mspVoteSubscription = supabase
      .channel('msp_vote_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'msp_votes' }, () => fetchMspVotes())
      .subscribe();

    return () => {
      supabase.removeChannel(gameSubscription);
      supabase.removeChannel(rsvpSubscription);
      supabase.removeChannel(voteSubscription);
      supabase.removeChannel(mspVoteSubscription);
    };
  }, []);

  useEffect(() => {
    if (nextGame) {
      fetchRSVPs();
      fetchVotes();
      fetchMspVotes();
    }
  }, [nextGame]);

  const fetchNextGame = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .neq('status', 'finished')
      .order('date', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') console.error('Error fetching game:', error);
    setNextGame(data);
    setLoading(false);
  };

  const fetchRSVPs = async () => {
    if (!nextGame) return;
    const { data, error } = await supabase
      .from('rsvps')
      .select('*, profiles(*)')
      .eq('game_id', nextGame.id)
      .order('created_at', { ascending: true });

    if (error) console.error('Error fetching RSVPs:', error);
    if (data) setRsvps(data);
  };

  const fetchVotes = async () => {
    if (!nextGame) return;
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .eq('game_id', nextGame.id);

    if (error) console.error('Error fetching votes:', error);
    if (data) setVotes(data);
  };

  const fetchMspVotes = async () => {
    if (!nextGame) return;
    const { data, error } = await supabase
      .from('msp_votes')
      .select('*')
      .eq('game_id', nextGame.id);

    if (error) {
      // Graceful fallback if table is not yet created
      console.warn('Error fetching msp_votes (table might need to be created in Supabase):', error);
      return;
    }
    if (data) setMspVotes(data);
  };

  const handleRSVP = async (going: boolean) => {
    setError(null);
    setSuccess(null);

    if (!nextGame || !user) return;
    if (!profile) {
      setError('Profile still loading...');
      return;
    }

    if (!profile.is_approved) {
      setError('Your account is pending approval by an admin.');
      return;
    }

    setActionLoading(true);
    try {
      // Fetch fresh data to avoid stale state issues
      const { data: currentRSVPs, error: fetchError } = await supabase
        .from('rsvps')
        .select('*, profiles(*)')
        .eq('game_id', nextGame.id)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      
      const latestRSVPs = currentRSVPs || [];
      const existingRSVP = latestRSVPs.find(r => r.user_id === user.id);
      
      if (going) {
        // Handle "I'M IN"
        if (existingRSVP && (existingRSVP.status === 'confirmed' || existingRSVP.status === 'waiting')) {
          setSuccess("You're already on it!");
          return;
        }

        const confirmedCount = latestRSVPs.filter(r => r.status === 'confirmed').length;
        const newStatus = confirmedCount < 22 ? 'confirmed' : 'waiting';

        if (existingRSVP) {
          const { error: updateError } = await supabase
            .from('rsvps')
            .update({ status: newStatus, created_at: new Date().toISOString() })
            .eq('id', existingRSVP.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('rsvps').insert({
            game_id: nextGame.id,
            user_id: user.id,
            status: newStatus
          });
          if (insertError) throw insertError;
        }
        setSuccess(newStatus === 'confirmed' ? "You're on it!" : 'Added to waiting list.');
      } else {
        // Handle "I'M OUT"
        if (existingRSVP && existingRSVP.status === 'declined') {
          setSuccess("You've already declined.");
          return;
        }

        const wasConfirmed = existingRSVP?.status === 'confirmed';

        // Try to update to 'declined'. If this fails due to DB constraint, fallback to delete.
        const { error: updateError } = await (existingRSVP 
          ? supabase.from('rsvps').update({ status: 'declined' }).eq('id', existingRSVP.id)
          : supabase.from('rsvps').insert({ game_id: nextGame.id, user_id: user.id, status: 'declined' }));

        if (updateError) {
          if (updateError.message.includes('violates check constraint') || updateError.message.includes('check constraint "rsvps_status_check"')) {
            // Fallback: If 'declined' isn't supported, just delete the entry (old behavior)
            if (existingRSVP) {
              const { error: deleteError } = await supabase.from('rsvps').delete().eq('id', existingRSVP.id);
              if (deleteError) throw deleteError;
              setSuccess('Successfully withdrawn.');
            } else {
              setSuccess('Already out.');
            }
          } else {
            throw updateError;
          }
        } else {
          setSuccess('Successfully recorded: OUT.');
        }

        // Manual Promotion: If a confirmed player withdraws, promote the first waiting player
        if (wasConfirmed && nextGame.status === 'open') {
          const firstWaiting = latestRSVPs.find(r => r.status === 'waiting');
          if (firstWaiting) {
            await supabase.from('rsvps').update({ status: 'confirmed' }).eq('id', firstWaiting.id);
          }
        }
      }
      
      await fetchRSVPs();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVote = async (candidateId: string) => {
    if (!nextGame || !user) return;
    
    // Eligibility check: Only confirmed players can vote
    const isConfirmed = rsvps.some(r => r.user_id === user.id && r.status === 'confirmed');
    if (!isConfirmed) {
      setError('Only players confirmed for this match can vote.');
      return;
    }

    // Restriction: Cannot vote for self
    if (candidateId === user.id) {
      setError('You cannot vote for yourself!');
      return;
    }

    // Restriction: Cannot vote for same user as MSP
    if (myMspVote && myMspVote.candidate_id === candidateId) {
      setError('You cannot vote for your MSP choice as MVP!');
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.from('votes').insert({
        game_id: nextGame.id,
        voter_id: user.id,
        candidate_id: candidateId
      });
      if (error) throw error;
      setSuccess('Vote cast successfully!');
      fetchVotes();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.code === '23505' ? 'You have already voted!' : err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMspVote = async (candidateId: string) => {
    if (!nextGame || !user) return;
    
    // Eligibility check: Only confirmed players can vote
    const isConfirmed = rsvps.some(r => r.user_id === user.id && r.status === 'confirmed');
    if (!isConfirmed) {
      setError('Only players confirmed for this match can vote.');
      return;
    }

    // Restriction: Cannot vote for self
    if (candidateId === user.id) {
      setError('You cannot vote for yourself!');
      return;
    }

    // Restriction: Cannot vote for same user as MVP
    if (myVote && myVote.candidate_id === candidateId) {
      setError('You cannot vote for your MVP choice as the Most Shitty Player!');
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.from('msp_votes').insert({
        game_id: nextGame.id,
        voter_id: user.id,
        candidate_id: candidateId
      });
      if (error) throw error;
      setSuccess('Most Shitty Player vote cast successfully!');
      fetchMspVotes();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.code === '23505' ? 'You have already voted for MSP!' : err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pitch"></div></div>;

  if (!nextGame) return (
    <div className="text-center py-20 flex flex-col items-center gap-6">
      <div className="space-y-2">
        <h2 className="text-2xl text-white/40">No upcoming games scheduled.</h2>
        <p className="text-white/20">Check back later or ask an admin!</p>
      </div>
      {profile?.is_admin && (
        <button 
          onClick={onGoToAdmin}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl transition-all font-bold"
        >
          <ShieldAlert size={20} /> Go to Admin Panel
        </button>
      )}
    </div>
  );

  const confirmed = rsvps.filter(r => r.status === 'confirmed');
  const waiting = rsvps.filter(r => r.status === 'waiting');
  const declined = rsvps.filter(r => r.status === 'declined');
  const myRSVP = rsvps.find(r => r.user_id === user?.id);
  const isIn = myRSVP && (myRSVP.status === 'confirmed' || myRSVP.status === 'waiting');
  const isOut = myRSVP && myRSVP.status === 'declined';
  const myVote = votes.find(v => v.voter_id === user?.id);
  const myMspVote = mspVotes.find(v => v.voter_id === user?.id);

  const getVoteCount = (playerId: string) => {
    return votes.filter(v => v.candidate_id === playerId).length;
  };

  const getMspVoteCount = (playerId: string) => {
    return mspVotes.filter(v => v.candidate_id === playerId).length;
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Game Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card pt-16 pb-8 px-6 md:p-12 relative overflow-hidden neon-border"
      >
        <div className="absolute top-0 right-0 p-4 flex items-center gap-3">
          <button 
            onClick={() => {
              fetchNextGame();
              fetchRSVPs();
              fetchVotes();
            }}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
            title="Refresh Data"
          >
            <RotateCw size={14} className={cn(loading && "animate-spin")} />
          </button>
          <span className={cn(
            "text-[10px] uppercase font-black px-4 py-1.5 rounded-full tracking-widest",
            nextGame.status === 'open' ? "bg-pitch text-black" : "bg-yellow-500 text-black"
          )}>
            {nextGame.status === 'open' ? 'RSVP OPEN' : 'RSVP CLOSED'}
          </span>
        </div>

        <div className="flex flex-col items-center text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic">NEXT MATCH</h1>
            <div className="flex flex-wrap justify-center gap-6 text-white/40 font-bold uppercase tracking-widest text-sm">
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nextGame.location}, Perth WA`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white/40 hover:text-pitch transition-colors hover:underline group"
                title="Click to navigate on Google Maps"
              >
                <MapPin size={16} className="text-white group-hover:text-pitch transition-colors" /> 
                <span className="text-white group-hover:text-pitch transition-colors">{nextGame.location}</span>
              </a>
              <div className="flex items-center gap-2"><Clock size={16} className="text-white" /> {formatTime(nextGame.time)}</div>
              <div className="flex items-center gap-2"><Trophy size={16} className="text-white" /> {formatDate(nextGame.date)}</div>
            </div>
          </div>

          {showConfirmCancel ? (
            <div className="bg-highlight/10 border border-highlight/20 p-5 rounded-2xl w-full max-w-md space-y-4 animate-in fade-in-50 duration-200 text-center">
              <p className="text-white text-md font-black uppercase tracking-tight">Are you sure you want to cancel your RSVP?</p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    setShowConfirmCancel(false);
                    await handleRSVP(false);
                  }}
                  disabled={actionLoading}
                  className="flex-1 bg-highlight text-white py-3.5 rounded-xl text-xs font-black tracking-wider uppercase hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="animate-spin" size={16} /> : "Yes, OUT ❌"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmCancel(false)}
                  className="flex-1 bg-white/10 text-white py-3.5 rounded-xl text-xs font-black tracking-wider uppercase hover:bg-white/20 active:scale-95 transition-all cursor-pointer"
                >
                  Keep Spot ⚽
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row items-center gap-4">
              <button
                onClick={() => handleRSVP(true)}
                disabled={actionLoading || nextGame.status !== 'open'}
                className={cn(
                  "px-10 py-5 rounded-2xl font-black text-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 min-w-[240px]",
                  isIn 
                    ? "bg-[#00ff66]/20 text-[#00ff66] border-2 border-[#00ff66]" 
                    : "bg-[#00ff66] text-black hover:bg-[#00cc55] shadow-[0_0_20px_rgba(0,255,102,0.3)]"
                )}
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  isIn ? "YOU'RE ON IT!" : "I'M IN!"
                )}
              </button>

              <button
                onClick={() => {
                  if (isIn) {
                    setShowConfirmCancel(true);
                  } else {
                    handleRSVP(false);
                  }
                }}
                disabled={actionLoading || nextGame.status !== 'open'}
                className={cn(
                  "px-10 py-5 rounded-2xl font-black text-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 min-w-[240px]",
                  isOut 
                    ? "bg-highlight/20 text-highlight border-2 border-highlight" 
                    : "bg-highlight text-white hover:bg-red-600 shadow-[0_0_20px_rgba(255,59,48,0.3)]"
                )}
              >
                {actionLoading ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  isOut ? "DECLINED" : "I'M OUT"
                )}
              </button>
            </div>
          )}
          <div className="mt-4 text-center">
            {error && <p className="text-highlight text-xs font-bold bg-highlight/10 px-3 py-1 rounded border border-highlight/20 inline-block">{error}</p>}
            {success && <p className="text-[#00ff66] text-xs font-bold bg-[#00ff66]/10 px-3 py-1 rounded border border-[#00ff66]/20 inline-block">{success}</p>}
          </div>
        </div>
      </motion.div>

      {/* Teams Section */}
      {nextGame.team_a && nextGame.team_a.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-card p-6 border-l-4 border-[#00ff66]">
            <h3 className="text-[#00ff66] font-black text-2xl mb-4 italic flex items-center gap-2">TEAM A (GREEN)</h3>
            <div className="space-y-2">
              {nextGame.team_a.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 text-white/80 font-bold">
                  <span className="text-[#00ff66]/40 text-xs w-4">{i + 1}</span>
                  {p.full_name}
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card p-6 border-l-4 border-orange-500">
            <h3 className="text-orange-500 font-black text-2xl mb-4 italic flex items-center gap-2">TEAM B (ORANGE)</h3>
            <div className="space-y-2">
              {nextGame.team_b.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 text-white/80 font-bold">
                  <span className="text-orange-500/40 text-xs w-4">{i + 1}</span>
                  {p.full_name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MVP Voting Section */}
      {nextGame.status === 'voting' && (
        <div className="space-y-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 border-2 border-blue-500/30 space-y-8"
          >
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black italic tracking-tighter flex items-center justify-center gap-3 text-blue-500">
                <VoteIcon size={32} /> WHO WAS THE BEST ON PITCH?
              </h2>
              <p className="text-white/40 text-sm font-bold uppercase tracking-widest">
                Live Poll Results • Can't vote for yourself or your MSP candidate!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...nextGame.team_a, ...nextGame.team_b].map(player => {
                const voteCount = getVoteCount(player.id);
                const isVotedByMe = myVote?.candidate_id === player.id;
                const isMe = player.id === user?.id;
                const isMyMspChoice = myMspVote?.candidate_id === player.id;
                const isDisabled = actionLoading || !!myVote || isMe || isMyMspChoice;

                return (
                  <button
                    key={player.id}
                    onClick={() => handleVote(player.id)}
                    disabled={isDisabled}
                    className={cn(
                      "relative group flex items-center justify-between p-4 rounded-2xl border transition-all overflow-hidden text-left",
                      isVotedByMe 
                        ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.5)]" 
                        : isMyMspChoice 
                          ? "bg-white/5 border-white/5 opacity-30 cursor-not-allowed"
                          : "bg-white/5 border-white/10 hover:border-blue-500/50 hover:bg-white/10",
                      isDisabled && !isVotedByMe && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {/* Progress Bar Background */}
                    {votes.length > 0 && (
                      <div 
                        className="absolute inset-0 bg-blue-500/10 transition-all duration-1000 animate-pulse" 
                        style={{ width: `${(voteCount / votes.length) * 100}%` }}
                      />
                    )}

                    <div className="relative flex items-center gap-3 z-10">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black",
                        isVotedByMe ? "bg-blue-500 text-white" : "bg-white/10 text-white/40"
                      )}>
                        {isVotedByMe ? <Check size={16} /> : voteCount}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold tracking-tight">{player.full_name}</span>
                        <div className="flex gap-1.5 mt-0.5">
                          {isMe && <span className="text-[10px] uppercase bg-white/10 px-2 py-0.5 rounded text-white/40">You</span>}
                          {isMyMspChoice && <span className="text-[9px] uppercase bg-red-500/10 px-2   py-0.5 rounded text-red-500 font-extrabold border border-red-500/20">Your MSP choice</span>}
                        </div>
                      </div>
                    </div>

                    <div className="relative text-xs font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity z-10">
                      {isVotedByMe ? "Your Vote" : `${voteCount} ${voteCount === 1 ? 'Vote' : 'Votes'}`}
                    </div>
                  </button>
                );
              })}
            </div>

            {myVote && (
              <div className="text-center">
                <p className="text-blue-400 text-sm font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} /> You have cast your MVP vote!
                </p>
              </div>
            )}
          </motion.div>

          {/* MSP Voting Section */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card p-8 border-2 border-red-500/30 space-y-8"
          >
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black italic tracking-tighter flex items-center justify-center gap-3 text-red-500">
                <Frown size={32} /> WHO WAS THE MOST SHITTY ON PITCH? (MSP)
              </h2>
              <p className="text-white/40 text-sm font-bold uppercase tracking-widest leading-relaxed">
                Live Poll Results • Can't vote for yourself or your MVP candidate!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...nextGame.team_a, ...nextGame.team_b].map(player => {
                const voteCount = getMspVoteCount(player.id);
                const isVotedByMe = myMspVote?.candidate_id === player.id;
                const isMe = player.id === user?.id;
                const isMyMvpChoice = myVote?.candidate_id === player.id;
                const isDisabled = actionLoading || !!myMspVote || isMe || isMyMvpChoice;

                return (
                  <button
                    key={player.id}
                    onClick={() => handleMspVote(player.id)}
                    disabled={isDisabled}
                    className={cn(
                      "relative group flex items-center justify-between p-4 rounded-2xl border transition-all overflow-hidden text-left",
                      isVotedByMe 
                        ? "bg-white text-black border-white shadow-[0_0_20px_rgba(239,68,68,0.5)]" 
                        : isMyMvpChoice 
                          ? "bg-white/5 border-white/5 opacity-30 cursor-not-allowed"
                          : "bg-white/5 border-white/10 hover:border-red-500/50 hover:bg-white/10",
                      isDisabled && !isVotedByMe && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {/* Progress Bar Background */}
                    {mspVotes.length > 0 && (
                      <div 
                        className="absolute inset-0 bg-red-500/10 transition-all duration-1000 animate-pulse" 
                        style={{ width: `${(voteCount / mspVotes.length) * 100}%` }}
                      />
                    )}

                    <div className="relative flex items-center gap-3 z-10">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-black",
                        isVotedByMe ? "bg-red-500 text-white" : "bg-white/10 text-white/40"
                      )}>
                        {isVotedByMe ? <Check size={16} /> : voteCount}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold tracking-tight">{player.full_name}</span>
                        <div className="flex gap-1.5 mt-0.5">
                          {isMe && <span className="text-[10px] uppercase bg-white/10 px-2 py-0.5 rounded text-white/40">You</span>}
                          {isMyMvpChoice && <span className="text-[9px] uppercase bg-blue-500/10 px-2 py-0.5 rounded text-blue-400 font-extrabold border border-blue-500/20">Your MVP choice</span>}
                        </div>
                      </div>
                    </div>

                    <div className="relative text-xs font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity z-10">
                      {isVotedByMe ? "Your Vote" : `${voteCount} ${voteCount === 1 ? 'Vote' : 'Votes'}`}
                    </div>
                  </button>
                );
              })}
            </div>

            {myMspVote && (
              <div className="text-center">
                <p className="text-red-400 text-sm font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} /> You have cast your MSP vote!
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Player Lists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-4">
          <h3 className="text-xl font-black italic flex items-center gap-2 text-white">
            <CheckCircle2 className="text-[#00ff66]" /> CONFIRMED ({confirmed.length}/22)
          </h3>
          <div className="space-y-2">
            {confirmed.map((rsvp, i) => (
              <div key={rsvp.id} className="glass-card p-4 flex items-center justify-between border-l-4 border-[#00ff66]">
                <div className="flex items-center gap-4">
                  <span className="text-white/20 font-black italic w-6">{i + 1}</span>
                  <span className="font-bold">{rsvp.profiles?.full_name}</span>
                </div>
                {rsvp.created_at && (
                  <span className="text-[10px] font-mono text-white/40 tracking-wider font-semibold">
                    {formatRsvpTime(rsvp.created_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-xl font-black italic flex items-center gap-2">
            <Shuffle className="text-yellow-500" /> WAITING ({waiting.length})
          </h3>
          <div className="space-y-2">
            {waiting.map((rsvp, i) => (
              <div key={rsvp.id} className="glass-card p-4 flex items-center justify-between opacity-60 border-l-4 border-yellow-500">
                <div className="flex items-center gap-4">
                  <span className="text-white/20 font-black italic w-6">{i + 1}</span>
                  <span className="font-bold">{rsvp.profiles?.full_name}</span>
                </div>
                {rsvp.created_at && (
                  <span className="text-[10px] font-mono text-white/30 tracking-wider font-semibold">
                    {formatRsvpTime(rsvp.created_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-black italic flex items-center gap-2 text-white/40">
            <X className="text-highlight" /> OUT ({declined.length})
          </h3>
          <div className="space-y-2">
            {declined.map((rsvp, i) => (
              <div key={rsvp.id} className="glass-card p-4 flex items-center justify-between opacity-40 border-l-4 border-highlight">
                <div className="flex items-center gap-4">
                  <span className="text-white/20 font-black italic w-6">{i + 1}</span>
                  <span className="font-bold">{rsvp.profiles?.full_name}</span>
                </div>
                {rsvp.created_at && (
                  <span className="text-[10px] font-mono text-white/20 tracking-wider font-semibold">
                    {formatRsvpTime(rsvp.created_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
