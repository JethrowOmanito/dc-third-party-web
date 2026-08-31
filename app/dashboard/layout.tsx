'use client';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { FloatingChatbot } from '@/components/chat/FloatingChatbot';
import { BenefitModal } from '@/components/BenefitModal';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="lg:ml-64 flex flex-col min-h-screen">
          <TopBar />
          {/* Content with bottom padding for mobile nav */}
          <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6">
            {children}
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <MobileBottomNav />

        {/* Global Assistant */}
        <FloatingChatbot />

        {/* Post-login benefits modal — reads sessionStorage flag set by
            login handlers; user can dismiss forever per-partner-id. */}
        <BenefitModal />
      </div>
    </AuthGuard>
  );
}
