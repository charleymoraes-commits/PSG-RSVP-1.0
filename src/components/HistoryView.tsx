import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Game, Profile, Vote } from '../types';
import { motion } from 'motion/react';
import { Trophy, Calendar, Users, Award } from 'lucide-react';
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

  useEffect(() => {
    fetchHistory();
    fetchMyVotes();
  }, []);

  const fetchHistory = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'finished')
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
    const { error } = await supabase.from('votes').insert({
      game_id: gameId,
      voter_id: user.id,
      candidate_id: candidateId
    });

    if (error) {
      alert('Error casting vote: ' + error.message);
    } else {
      setMyVotes({ ...myVotes, [gameId]: candidateId });
      setVotingFor(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
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
                <div className="flex items-center gap-3 text-white/60">
                  <Calendar size={18} />
                  <span>{formatDate(game.date)}</span>
                </div>
                <h2 className="text-2xl">{game.location}</h2>
                <div className="flex items-center gap-4 text-sm text-white/40">
                  <div className="flex items-center gap-1"><Users size={16} /> {(game.team_a?.length || 0) + (game.team_b?.length || 0)} Players</div>
                  {game.mvp_winner && (
                    <div className="flex items-center gap-1 text-white"><Trophy size={16} /> MVP: {game.mvp_winner}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center">
                {myVotes[game.id] ? (
                  <div className="bg-white/5 px-4 py-2 rounded-lg text-white/40 text-sm flex items-center gap-2">
                    <Award size={16} /> Voted
                  </div>
                ) : (
                  <button
                    onClick={() => startVoting(game)}
                    className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-6 py-3 rounded-xl font-bold transition-all"
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
