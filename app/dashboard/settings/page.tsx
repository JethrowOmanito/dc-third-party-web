'use client';
import { useRouter } from 'next/navigation';
import { LogOut, Building2, User, Shield, MessageCircle, Phone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';

export default function SettingsPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const handleContactAdmin = () => {
    const phone = '6588656751';
    const msg = encodeURIComponent('Hello, I need assistance with the Doctor Clean Partner Portal.');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  const handleForgotPassword = () => {
    const phone = '6588656751';
    const msg = encodeURIComponent('Hello, I would like to reset my password for the Doctor Clean Partner Portal.');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Profile Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 text-base truncate">{user?.company_name || user?.username}</p>
              {user?.company_type && <p className="text-sm text-gray-500">{user.company_type}</p>}
              {user?.company_code && (
                <Badge variant="outline" className="mt-1 text-xs">Code: {user.company_code}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Account Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <InfoRow icon={User} label="Username" value={user?.username || '—'} />
          <InfoRow icon={Building2} label="Company" value={user?.company_name || '—'} />
          <InfoRow icon={Shield} label="Role" value="Partner (Third Party)" />
        </CardContent>
      </Card>

      {/* Support */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Support</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <button
            onClick={handleForgotPassword}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
          >
            <Phone className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Reset Password</p>
              <p className="text-xs text-gray-400">Contact admin via WhatsApp</p>
            </div>
          </button>
          <button
            onClick={handleContactAdmin}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
          >
            <MessageCircle className="w-4 h-4 text-green-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">Contact Admin</p>
              <p className="text-xs text-gray-400">+65 8865 6751 on WhatsApp</p>
            </div>
          </button>
        </CardContent>
      </Card>

      {/* App info */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">App Information</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <div className="flex justify-between"><span>Version</span><span className="font-medium">1.0.0</span></div>
          <div className="flex justify-between"><span>Platform</span><span className="font-medium">Web</span></div>
          <div className="flex justify-between"><span>Build</span><span className="font-medium">Production</span></div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="destructive"
        onClick={handleLogout}
        className="w-full h-12 text-base"
      >
        <LogOut className="w-4 h-4" />
        Log Out
      </Button>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<any>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <div className="flex justify-between flex-1 min-w-0">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm font-medium text-gray-700 truncate ml-2">{value}</span>
      </div>
    </div>
  );
}
