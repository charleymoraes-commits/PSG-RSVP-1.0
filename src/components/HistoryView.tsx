import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, Profile, Vote } from '../types';
import { motion } from 'motion/react';
import { Trophy, Calendar, Users, Award, MapPin, X, Frown } from 'lucide-react';
import { formatDate } from '../lib/utils';

interface HistoryViewProps {
  user: any;
}

export default function HistoryView({ user }: HistoryViewProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingFor, setVotingFor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setStatusMessage(prev => prev?.text === text ? null : prev);
    }, 8000);
  };

  useEffect(() => {
    fetchHistory();
    fetchMyVotes();
  }, []);

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .order('date', { ascending: false });

    if (error) console.error('Error fetching history:', error);
    if (data) setGames(data);
    setLoading(false);
  };

  const fetchMyVotes = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('votes')
      .select('*')
      .eq('voter_id', user.id);
    
    if (data) {
      const voteMap: Record<string, string> = {};
      data.forEach(v => voteMap[v.game_id] = v.candidate_id);
      setMyVotes(voteMap);
    }
  };

  const startVoting = (game: Game) => {
    const allPlayers = [...(game.team_a || []), ...(game.team_b || [])];
    setCandidates(allPlayers);
    setVotingFor(game.id);
  };

  const castVote = async (gameId: string, candidateId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('votes').insert({
        game_id: gameId,
        voter_id: user.id,
        candidate_id: candidateId
      });

      if (error) {
        showStatus('error', 'Error casting vote: ' + error.message);
      } else {
        showStatus('success', 'Thank you! Your vote for the match MVP has been recorded.');
        setMyVotes({ ...myVotes, [gameId]: candidateId });
        setVotingFor(null);
      }
    } catch (err: any) {
      showStatus('error', 'Unexpected error casting vote: ' + (err.message || err));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            statusMessage.type === 'error' 
              ? "bg-red-500/10 border-red-500/20 text-red-400" 
              : "bg-[#00ff66]/10 border-[#00ff66]/20 text-[#00ff66]"
          }`}
        >
          <div className="flex-1 text-sm font-bold whitespace-pre-line">{statusMessage.text}</div>
          <button onClick={() => setStatusMessage(null)} className="text-white/40 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </motion.div>
      )}

      <div className="space-y-4">
        <h1 className="text-5xl font-black tracking-tighter italic text-white">MATCH HISTORY</h1>
        <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Relive the glory and vote for your MVPs.</p>
      </div>

      <div className="space-y-6">
        {games.map((game) => (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6"
          >
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-white/60">
                  <div className="flex items-center gap-2">
                    <Calendar size={18} />
                    <span>{formatDate(game.date)}</span>
                  </div>
                  {game.status === 'open' && (
                    <span className="text-[10px] bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/20 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                      RSVP Open
                    </span>
                  )}
                  {game.status === 'closed' && (
                    <span className="text-[10px] bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                      RSVP Closed
                    </span>
                  )}
                  {game.status === 'voting' && (
                    <span className="text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse">
                      Voting Active
                    </span>
                  )}
                </div>
                <a 
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${game.location}, Perth WA`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-white hover:text-pitch transition-colors hover:underline group"
                  title="Click to view location on Google Maps"
                >
                  <MapPin size={16} className="text-white group-hover:text-pitch transition-colors" /> 
                  <h2 className="text-2xl font-bold group-hover:text-pitch transition-colors">{game.location}</h2>
                </a>
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center gap-1.5 text-sm text-white/40"><Users size={16} /> {(game.team_a?.length || 0) + (game.team_b?.length || 0)} Players</div>
                  {game.mvp_winner && (
                    <div className="flex items-center gap-1.5 text-blue-400 font-bold text-sm"><Trophy size={16} className="text-yellow-500" /> MVP: {game.mvp_winner}</div>
                  )}
                  {game.msp_winner && (
                    <div className="flex items-center gap-1.5 text-red-400 font-bold text-sm"><Frown size={16} className="text-red-500" /> MSP: {game.msp_winner}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center">
                {game.status === 'open' || game.status === 'closed' ? (
                  <button
                    disabled
                    className="bg-white/5 text-white/20 border border-white/5 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-not-allowed"
                    title="Voting will open after the match is played"
                  >
                    Vote for MVP (Locked)
                  </button>
                ) : myVotes[game.id] ? (
                  <div className="bg-white/5 px-4 py-2 rounded-lg text-white/40 text-sm flex items-center gap-2">
                    <Award size={16} /> Voted
                  </div>
                ) : game.status === 'finished' ? (
                  <div 
                    className="bg-white/5 text-white/20 border border-white/5 px-5 py-2.5 rounded-xl text-xs font-bold cursor-not-allowed"
                    title="Voting is closed for this match"
                  >
                    Voting Closed
                  </div>
                ) : (
                  <button
                    onClick={() => startVoting(game)}
                    className="bg-pitch text-black px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-pitch-dark transition-all shadow-[0_0_15px_rgba(0,255,102,0.2)]"
                  >
                    Vote for MVP
                  </button>
                )}
              </div>
            </div>

            {/* Voting Modal/Dropdown */}
            {votingFor === game.id && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-6 pt-6 border-t border-white/10"
              >
                <h3 className="text-sm font-bold uppercase tracking-widest text-white/40 mb-4">Select MVP</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {candidates.map(player => (
                    <button
                      key={player.id}
                      onClick={() => castVote(game.id, player.id)}
                      className="p-3 bg-white/5 hover:bg-white hover:text-black rounded-lg text-sm font-bold transition-all text-left truncate"
                    >
                      {player.full_name}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setVotingFor(null)}
                  className="mt-4 text-xs text-white/20 hover:text-white underline"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </motion.div>
        ))}

        {games.length === 0 && (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
            <p className="text-white/20">No finished games yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
