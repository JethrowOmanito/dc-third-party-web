'use client';
import { useRouter } from 'next/navigation';
import {
  LogOut,
  Building2,
  User,
  Shield,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    logout();
    try { localStorage.removeItem('dc-partner-auth-v2'); } catch {}
    window.location.href = '/login';
  };

  const handleContactAdmin = () => {
    const phone = '6588656751';
    const msg = encodeURIComponent(
      'Hello, I need assistance with the Doctor Clean Partner App.'
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  const handleForgotPassword = () => {
    const phone = '6588656751';
    const msg = encodeURIComponent(
      'Hello, I would like to reset my password for the Doctor Clean Partner App.'
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      {/* Page title */}
      <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
        Settings
      </h1>

      {/* Profile Card */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Building2 className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900 truncate">
              {user?.company_name || user?.username}
            </p>
            {user?.username && (
              <p className="text-sm text-slate-500 truncate">{user.username}</p>
            )}
            {user?.company_code && (
              <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-slate-50 ring-1 ring-slate-200 text-xs font-medium text-slate-600">
                Code: {user.company_code}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Account Details */}
      <SectionCard title="Account Details">
        <InfoRow icon={User} label="Username" value={user?.username || '—'} />
        <InfoRow icon={Building2} label="Company" value={user?.company_name || '—'} />
        <InfoRow icon={Shield} label="Role" value="Partner (Third Party)" />
      </SectionCard>

      {/* Support */}
      <SectionCard title="Support">
        <SupportRow
          icon={Phone}
          iconColor="text-slate-400"
          title="Reset Password"
          subtitle="Contact admin via WhatsApp"
          onClick={handleForgotPassword}
        />
        <SupportRow
          icon={MessageCircle}
          iconColor="text-emerald-600"
          title="Contact Admin"
          subtitle="+65 8865 6751 on WhatsApp"
          onClick={handleContactAdmin}
        />
      </SectionCard>

      {/* App Information */}
      <SectionCard title="App Information">
        <KeyValueRow label="Version" value="1.0.0" />
        <KeyValueRow label="Platform" value="Web" />
        <KeyValueRow label="Build" value="Production" />
      </SectionCard>

      {/* Log Out */}
      <button
        onClick={handleLogout}
        className="w-full h-12 rounded-2xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-colors shadow-sm"
      >
        <LogOut className="w-5 h-5" />
        Log Out
      </button>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-100 shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
      </div>
      <div className="px-5 pb-5 space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex justify-between items-center flex-1 min-w-0">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="text-sm font-semibold text-slate-900 truncate ml-2">{value}</span>
      </div>
    </div>
  );
}

function SupportRow({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full p-3 -mx-1 rounded-xl hover:bg-slate-50 text-left transition-colors"
    >
      <Icon className={`w-5 h-5 shrink-0 ${iconColor}`} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </button>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}
