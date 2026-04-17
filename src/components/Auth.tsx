import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { LogIn, UserPlus, Loader2, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [view, setView] = useState<'login' | 'signup' | 'forgot'>('login');

  const [success, setSuccess] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (view === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setSuccess('Password reset link sent! Check your email.');
        return;
      }

      if (view === 'signup' && password !== confirmPassword) {
        setError('Passwords do not match!');
        setLoading(false);
        return;
      }

      if (view === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setAttempts(prev => prev + 1);
          if (error.message.includes('Invalid login credentials')) {
            setError('Invalid email or password. Please try again.');
          } else {
            throw error;
          }
          setLoading(false);
          return;
        }
        setAttempts(0);
      } else {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        
        // If session is returned immediately (email confirm disabled), we're good
        if (data.session) {
          setSuccess('Account created! Welcome to PSG Perth.');
        } else {
          setSuccess("Log in now to confirm your spot or so..");
          setView('login');
        }
      }
    } catch (err: any) {
      if (err.message.includes('User already registered')) {
        setError('This email is already registered. Please try to Login or Reset Password.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const isLogin = view === 'login';
  const isSignUp = view === 'signup';
  const isForgot = view === 'forgot';

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card w-full max-w-md p-6 md:p-8 neon-glow"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl mb-2 text-white font-black tracking-tighter italic">PSG PERTH</h1>
          <p className="text-white/40 font-bold uppercase tracking-widest text-[10px]">Weekly Soccer Group</p>
        </div>

        <div className="flex bg-white/5 p-1 rounded-xl mb-8">
          <button
            onClick={() => { setView('login'); setError(null); setSuccess(null); }}
            className={`flex-1 py-2 rounded-lg transition-all text-sm font-bold ${
              isLogin ? 'bg-pitch text-black' : 'text-white/60'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => { setView('signup'); setError(null); setSuccess(null); }}
            className={`flex-1 py-2 rounded-lg transition-all text-sm font-bold ${
              isSignUp ? 'bg-pitch text-black' : 'text-white/60'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <h2 className="text-center font-black uppercase tracking-widest text-xs text-white/40 mb-4">
            {isForgot ? 'Reset Password' : ''}
          </h2>

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-pitch transition-colors"
                placeholder="John Doe"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-pitch transition-colors"
              placeholder="your@email.com"
            />
          </div>
          
          {(isLogin || isSignUp) && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-white transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          )}

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1">Confirm Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-white transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          )}

          {isLogin && (
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={() => setView('forgot')}
                className="text-[10px] uppercase font-black text-white/40 hover:text-white transition-colors"
              >
                Forgot Password?
              </button>
            </div>
          )}

          {error && <p className="text-highlight text-sm bg-highlight/10 p-3 rounded-lg border border-highlight/20">{error}</p>}
          
          {attempts >= 3 && isLogin && (
            <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20 flex items-start gap-3">
              <AlertCircle className="text-yellow-500 shrink-0" size={18} />
              <div className="space-y-1">
                <p className="text-yellow-500 text-xs font-bold uppercase">Too many attempts?</p>
                <p className="text-white/60 text-[10px] leading-tight">
                  If you're having trouble logging in, please contact the group admin via WhatsApp to reset your access.
                </p>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-white/10 p-4 rounded-xl border border-white/20 space-y-2">
              <p className="text-white text-sm font-bold flex items-center gap-2">
                <Check size={16} /> {success}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white hover:bg-white/90 text-black font-black uppercase tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn size={20} /> Login
              </>
            ) : isSignUp ? (
              <>
                <UserPlus size={20} /> Create Account
              </>
            ) : (
              'Submit'
            )}
          </button>

          {(isForgot) && (
            <button 
              type="button"
              onClick={() => setView('login')}
              className="w-full text-white/40 text-xs font-bold hover:text-white transition-colors py-2"
            >
              Back to Login
            </button>
          )}
        </form>
      </motion.div>
    </div>
  );
}
