'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginSchema, referenceLoginSchema, type LoginInput, type ReferenceLoginInput } from '@/lib/validations/auth.schema';
import { useAuthStore } from '@/store/authStore';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Eye, EyeOff, Hash, Loader2, Lock, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<'partner' | 'reference'>('partner');
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { setUser, setGuestSession } = useAuthStore();

  const partnerForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const referenceForm = useForm<ReferenceLoginInput>({
    resolver: zodResolver(referenceLoginSchema),
    defaultValues: { referenceNumber: '' },
  });

  const handlePartnerLogin = async (data: LoginInput) => {
    setServerError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || 'Login failed');
        return;
      }
      setUser(json.user);
      router.push('/dashboard');
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReferenceLogin = async (data: ReferenceLoginInput) => {
    setServerError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error || 'Reference number not found');
        return;
      }
      setGuestSession(json.session);
      router.push(`/track/${data.referenceNumber.trim()}`);
    } catch {
      setServerError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    const phone = '6588656751';
    const msg = encodeURIComponent('Hello, I forgot my password for the Doctor Clean Partner portal. Can you help me reset it?');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-100 flex flex-col items-center justify-center px-4 py-8">
      {/* Brand */}
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-xl shadow-emerald-600/10 mb-6 p-2 ring-1 ring-emerald-600/5">
          <img src="/logo.png" alt="Doctor Clean Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Doctor Clean</h1>
        <p className="text-emerald-600/70 text-sm font-semibold tracking-wider uppercase mt-1">Partner App</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => { setActiveTab('partner'); setServerError(''); }}
            className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'partner'
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Partner Login
          </button>
          <button
            onClick={() => { setActiveTab('reference'); setServerError(''); }}
            className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
              activeTab === 'reference'
                ? 'text-emerald-600 border-b-2 border-emerald-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Track Job
          </button>
        </div>

        <div className="p-6">
          {/* Server error */}
          {serverError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {serverError}
            </div>
          )}

          {activeTab === 'partner' ? (
            <form onSubmit={partnerForm.handleSubmit(handlePartnerLogin)} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    {...partnerForm.register('username')}
                    placeholder="Enter your username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="pl-9"
                  />
                </div>
                {partnerForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-red-600">{partnerForm.formState.errors.username.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    {...partnerForm.register('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {partnerForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-red-600">{partnerForm.formState.errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
              </Button>

              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full text-center text-sm text-emerald-600 hover:underline py-1"
              >
                Forgot password? Contact admin via WhatsApp
              </button>
            </form>
          ) : (
            <form onSubmit={referenceForm.handleSubmit(handleReferenceLogin)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Job Reference Number
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Enter your booking reference number from your confirmation email to track your job.
                </p>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    {...referenceForm.register('referenceNumber')}
                    placeholder="e.g. 1042"
                    autoCapitalize="characters"
                    className="pl-9"
                  />
                </div>
                {referenceForm.formState.errors.referenceNumber && (
                  <p className="mt-1 text-xs text-red-600">
                    {referenceForm.formState.errors.referenceNumber.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Track My Job'}
              </Button>
            </form>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-gray-400 text-center">
        Doctor Clean Partner App © {new Date().getFullYear()}
      </p>
    </div>
  );
}
