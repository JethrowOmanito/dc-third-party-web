import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Doctor Clean Partner Portal',
    short_name: 'DC Partner',
    description: 'Doctor Clean partner portal — manage jobs and bookings.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0eae8b',
  };
}
