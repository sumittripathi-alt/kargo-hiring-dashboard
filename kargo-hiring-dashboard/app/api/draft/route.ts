import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { id, subject, body } = await req.json();
  if (!id || !subject?.trim() || !body?.trim()) return NextResponse.json({ error: 'id, subject and body required' }, { status: 400 });
  const { data: c } = await db().from('candidates').select('email_status').eq('id', id).single();
  if (c?.email_status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 409 });
  const { error } = await db().from('candidates').update({ email_subject: subject, email_body: body, email_edited: true }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
