import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { customerInfo, serviceInfo, inquiryType, notes } = body;

    // Simple validation
    if (!customerInfo || !serviceInfo || !inquiryType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('booking_inquiries')
      .insert({
        customer_info: customerInfo,
        service_info: serviceInfo,
        inquiry_type: inquiryType,
        notes: notes || '',
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating inquiry:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Optional: Trigger a notification to admin (could be a webhook or a direct insert into a notifications table)
    // For now, we rely on the admin dashboard real-time subscription or polling.

    return NextResponse.json({ success: true, inquiryId: data.id });
  } catch (err: any) {
    console.error('Inquiry API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
