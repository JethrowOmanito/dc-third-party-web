'use client';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Users, Plus, Copy, Check, Trash2, ShieldCheck, User as UserIcon, AlertTriangle, MoreVertical, UserCog, UserMinus } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildInviteUrl } from '@/lib/invites';

// Team management — admin only. Lists current members + pending invites,
// and lets the admin generate a new invite link they can copy/share.

interface Member {
  id: string;
  username: string;
  full_name: string | null;
  email: string | null;
  partner_role: string | null;
  approval_status: string;
  created_at: string;
}

interface Invite {
  id: string;
  token: string;
  email: string | null;
  role_to_assign: 'admin' | 'employee';
  expires_at: string;
  created_at: string;
}

export default function TeamPage() {
  const { user } = useAuthStore();
  // Onboarding gate is handled centrally by AuthGuard — since
  // /dashboard/settings/team is NOT in COMPANY_GATE_EXEMPT, an
  // unapproved admin already gets bounced to onboarding before this
  // page ever mounts. No duplicate redirect needed.
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/team/invite', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load team');
      setMembers(json.members ?? []);
      setInvites(json.invites ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createInvite = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role_to_assign: 'employee' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to create invite');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }, [load]);

  const revokeInvite = useCallback(async (id: string) => {
    if (!confirm('Revoke this invite? The link will stop working.')) return;
    try {
      const res = await fetch(`/api/team/invite/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? 'Failed to revoke');
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [load]);

  const copyLink = useCallback(async (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = buildInviteUrl(token, origin);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 1500);
    } catch {
      // Fallback — prompt so user can copy manually.
      window.prompt('Copy this invite link:', url);
    }
  }, []);

  const changeRole = useCallback(async (memberId: string, currentRole: string | null) => {
    const nextRole = (currentRole === 'admin' || currentRole === 'interior_designer') ? 'employee' : 'admin';
    if (!confirm(`Change this member to ${nextRole}?`)) return;
    try {
      const res = await fetch(`/api/team/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? 'Failed to change role');
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [load]);

  const removeMember = useCallback(async (memberId: string, label: string) => {
    if (!confirm(`Remove ${label} from your team? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? 'Failed to remove');
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading team…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
          <Users className="w-6 h-6" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Team</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage {user?.company_name ?? 'your company'}&apos;s members and invite links.
          </p>
        </div>
        <Button
          onClick={createInvite}
          disabled={creating}
          className="bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl h-10 px-4"
        >
          {creating
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            : <><Plus className="w-4 h-4 mr-1.5" /> Invite Employee</>}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 ring-1 ring-red-100">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Pending invites */}
      <section className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Pending Invites</h2>
        {invites.length === 0 ? (
          <p className="text-xs text-slate-400">No open invites. Click <span className="font-semibold">Invite Employee</span> to generate a shareable link.</p>
        ) : (
          <div className="space-y-2">
            {invites.map((inv) => {
              const isCopied = copiedToken === inv.token;
              return (
                <div key={inv.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100">
                  <div className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-700 truncate">
                      Role: <span className="capitalize">{inv.role_to_assign}</span>
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                      {inv.email ? ` · ${inv.email}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => copyLink(inv.token)}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0',
                      isCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-600 text-white hover:bg-emerald-700',
                    )}
                  >
                    {isCopied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy link</>}
                  </button>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="text-slate-400 hover:text-red-500 p-1 flex-shrink-0"
                    title="Revoke invite"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Members */}
      <section className="bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">Members</h2>
        <div className="space-y-2">
          {members.map((m) => {
            const isSelf = m.id === user?.id;
            return (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 ring-1 ring-slate-100">
                <div className="w-9 h-9 rounded-lg bg-white ring-1 ring-slate-200 text-slate-500 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {m.full_name ?? m.username}
                    {isSelf && <span className="ml-1 text-[10px] text-slate-400 font-medium">(you)</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    @{m.username}{m.email ? ` · ${m.email}` : ''}
                  </p>
                </div>
                <span className={cn(
                  'text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md flex-shrink-0',
                  m.partner_role === 'employee'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-emerald-100 text-emerald-700',
                )}>
                  {m.partner_role === 'employee' ? 'Employee' : 'Admin'}
                </span>
                {/* Row actions — hidden on the caller's own row to prevent
                    self-demotion / self-removal (API also rejects). */}
                {!isSelf && (
                  <MemberActions
                    onChangeRole={() => changeRole(m.id, m.partner_role)}
                    onRemove={() => removeMember(m.id, m.full_name ?? m.username)}
                    isEmployee={m.partner_role === 'employee'}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// Small popover menu on each member row — Change Role / Remove.
function MemberActions({
  onChangeRole, onRemove, isEmployee,
}: {
  onChangeRole: () => void;
  onRemove: () => void;
  isEmployee: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        title="Member actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-44 bg-white rounded-xl ring-1 ring-slate-200 shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => { setOpen(false); onChangeRole(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
          >
            <UserCog className="w-3.5 h-3.5 text-slate-500" />
            Make {isEmployee ? 'admin' : 'employee'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onRemove(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 text-left border-t border-slate-100"
          >
            <UserMinus className="w-3.5 h-3.5" />
            Remove from team
          </button>
        </div>
      )}
    </div>
  );
}
