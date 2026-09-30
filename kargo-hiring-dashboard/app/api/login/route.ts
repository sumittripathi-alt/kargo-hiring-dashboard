import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, tokenFor } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw || password !== pw) return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await tokenFor(pw), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30, path: '/' });
  return res;
}
