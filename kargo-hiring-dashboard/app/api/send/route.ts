import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { sendCandidateEmail } from '@/lib/email';

export const maxDuration = 60;

// Nothing goes out without an explicit founder click. Rejections additionally require a review acknowledgement.
export async function POST(req: NextRequest) {
  try {
    const { id, reviewed } = await req.json();
    const { data: c } = await db().from('candidates').select('email_type').eq('id', id).single();
    if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (c.email_type === 'reject' && !reviewed) return NextResponse.json({ error: 'Confirm you have reviewed this candidate before sending a rejection' }, { status: 400 });
    return NextResponse.json(await sendCandidateEmail(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
