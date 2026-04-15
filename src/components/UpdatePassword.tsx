import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { Lock, Loader2, Check, AlertCircle } from 'lucide-react';

export default function UpdatePassword({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) {
        throw error;
      } else {
        setSuccess(true);
        // Give the user a moment to see the success message before redirecting
        setTimeout(onComplete, 2500);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card max-w-md w-full p-8 space-y-6 neon-glow"
      >
        <div className="text-center space-y-2">
          <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/30">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter uppercase text-white">New Password</h1>
          <p className="text-white/40 text-sm">Secure your account with a new password.</p>
        </div>

        {success ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 p-6 rounded-2xl border border-white/20 text-center space-y-4"
          >
            <div className="bg-white text-black w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              <Check size={24} />
            </div>
            <div className="space-y-1">
              <p className="text-white font-bold uppercase tracking-wider">Success!</p>
              <p className="text-white/60 text-xs">Your password has been updated.</p>
            </div>
            <p className="text-white/30 text-[10px] animate-pulse">Redirecting to the app...</p>
          </motion.div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase font-black tracking-widest ml-1">New Password</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-white outline-none transition-all text-white placeholder:text-white/10"
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase font-black tracking-widest ml-1">Confirm Password</label>
              <input 
                type="password" 
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-white outline-none transition-all text-white placeholder:text-white/10"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-highlight/10 border border-highlight/20 p-3 rounded-xl flex items-center gap-3"
              >
                <AlertCircle className="text-highlight shrink-0" size={18} />
                <p className="text-highlight text-xs font-bold">{error}</p>
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-50 active:scale-95"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>Update Password</>
              )}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
