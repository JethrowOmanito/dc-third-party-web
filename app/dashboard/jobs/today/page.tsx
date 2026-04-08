import { JobsList } from '@/components/jobs/JobsList';

export default function TodayJobsPage() {
  return <JobsList filter="today" />;
}
