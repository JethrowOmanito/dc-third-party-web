import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('partner_companies')
      .select('id, name, description, company_code, company_type')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[partners/companies] fetch error:', error);
      return NextResponse.json({ error: 'Failed to load companies' }, { status: 500 });
    }
    return NextResponse.json({ companies: data ?? [] }, { status: 200 });
  } catch (err) {
    console.error('[partners/companies] unexpected:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
