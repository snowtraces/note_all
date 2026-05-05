import React, { useState } from 'react';
import { Lock, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { login } from '../api/authApi';
import { useTheme } from '../context/ThemeContext';

const LoginOverlay = ({ onLoginSuccess }) => {
  const { mode } = useTheme();
  const isLight = mode === 'light';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');
    try {
      await login(password);
      onLoginSuccess();
    } catch (err) {
      setError(err.message || '密码错误，请重试');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-base flex items-center justify-center p-6 font-sans">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primeAccent/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primeAccent/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-md w-full animate-in fade-in zoom-in duration-500">
        {/* Logo / Title Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primeAccent/10 border border-primeAccent/20 shadow-[0_0_30px_rgba(255,215,0,0.1)] mb-6">
            <ShieldCheck className="w-10 h-10 text-primeAccent" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-light tracking-[0.2em] uppercase mb-3 text-textPrimary">Note All</h1>
          <p className="text-textTertiary text-sm font-light tracking-widest uppercase">个人智慧容器 · 身份验证</p>
        </div>

        {/* Login Form Card */}
        <div className="backdrop-blur-3xl shadow-2xl rounded-[32px] p-10 bg-bgSubtle border border-borderSubtle">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-3">
              <label className="block text-[10px] font-mono text-textMuted uppercase tracking-[0.2em] ml-1">
                Security Key
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-textMuted/50 group-focus-within:text-primeAccent/50 transition-colors" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入访问密钥..."
                  autoFocus
                  className="w-full h-14 border rounded-2xl pl-14 pr-6 text-lg tracking-widest focus:outline-none transition-all bg-bgSubtle border-borderSubtle text-textPrimary placeholder-textMuted focus:border-primeAccent/40"
                />
              </div>
              {error && (
                <p className="text-red-400/80 text-[11px] font-light mt-2 ml-1 animate-in slide-in-from-top-1">
                   {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className={`w-full h-14 rounded-2xl flex items-center justify-center gap-3 transition-all duration-500 overflow-hidden relative group
                ${loading || !password
                  ? 'bg-bgSubtle text-textTertiary cursor-not-allowed border border-borderSubtle'
                  : 'bg-primeAccent text-black font-semibold hover:shadow-[0_0_40px_rgba(255,215,0,0.3)] hover:-translate-y-1'}`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span className="tracking-[0.1em] uppercase text-xs">进入加密空间</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="mt-12 text-center">
          <p className="text-[10px] font-mono text-textMuted/20 uppercase tracking-[0.3em]">
            Secure Instance · Local Deployment Only
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginOverlay;
