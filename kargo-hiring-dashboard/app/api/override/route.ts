import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

// Founder moves a candidate across the line. The system never decides this for him.
export async function POST(req: NextRequest) {
  const { id, tier } = await req.json();
  if (!id || (tier !== 'invite' && tier !== 'reject')) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const { data: c } = await db().from('candidates').select('email_status').eq('id', id).single();
  if (c?.email_status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 409 });
  const { error } = await db().from('candidates').update({ tier, tier_override: true }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
