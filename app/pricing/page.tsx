// Public pricing comparison page — no auth required.
//
// Shows TCC vs Doctor Clean (ID partner) rates side-by-side so interior
// designers landing here from the cold-outreach email can see the value
// before committing to register. Data reads directly via admin client to
// bypass the partner-only auth on the /api/pricing route (that route is
// for logged-in wizard use; this page is a marketing surface).

import { createAdminClient } from '@/lib/supabase/admin';
import PricingClient from './PricingClient';

export const revalidate = 300; // cache 5 min — pricing changes rarely

type Row = {
  section: string;
  subgroup: string | null;
  unit_label: string;
  sqft_label: string | null;
  ala_carte_price: number | null;
  scrubbing_price: number | null;
  scrubbing_formaldehyde_price: number | null;
  is_tbq: boolean;
  sort_order: number;
};

async function fetchRows(table: 'tcc_pricing' | 'id_pricing'): Promise<Row[]> {
  const sb = createAdminClient();
  const { data } = await sb
    .from(table)
    .select('section, subgroup, unit_label, sqft_label, ala_carte_price, scrubbing_price, scrubbing_formaldehyde_price, is_tbq, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  return (data ?? []) as Row[];
}

export default async function PricingPage() {
  const [tcc, id] = await Promise.all([fetchRows('tcc_pricing'), fetchRows('id_pricing')]);
  return <PricingClient tccRows={tcc} idRows={id} />;
}
