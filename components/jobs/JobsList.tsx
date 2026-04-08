'use client';
import { JobCard } from '@/components/jobs/JobCard';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/authStore';
import type { Job } from '@/types';
import { Inbox, Loader2, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface JobsListProps {
  filter?: 'today' | 'incoming' | 'all';
  title?: string;
}

export function JobsList({ filter = 'all', title }: JobsListProps) {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const supabase = getSupabaseClient();

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('events')
        .select('id, Title, Start_Date, End_Date, Start_Time, End_Time, Start_Time_Display, End_Time_Display, Service_Type, Name, Assign_Cleaner, lifecycle_state, commission_percentage, rebate_amount, company_reference, Extra_Service')
        .eq('owned_by_third_party', user.id)
        .order('Start_Date', { ascending: false });

      const today = new Date().toISOString().split('T')[0];
      if (filter === 'today') {
        query = query.eq('Start_Date', today);
      } else if (filter === 'incoming') {
        query = query.gt('Start_Date', today);
      }

      const { data } = await query.limit(100);
      setJobs((data as Job[]) || []);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel(`jobs-list-${filter}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'events' }, fetchJobs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  const filtered = jobs.filter((j) =>
    !search ||
    j.Title?.toLowerCase().includes(search.toLowerCase()) ||
    j.Service_Type?.toLowerCase().includes(search.toLowerCase()) ||
    j.Title?.toLowerCase().includes(search.toLowerCase()) ||
    j.company_reference?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-gray-400">
          <Inbox className="w-12 h-12" />
          <p className="text-sm font-medium">
            {search ? 'No results found' : filter === 'today' ? "No jobs scheduled today" : filter === 'incoming' ? "No upcoming jobs" : "No jobs yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs text-gray-500 font-medium">{filtered.length} job{filtered.length !== 1 ? 's' : ''}</p>
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
