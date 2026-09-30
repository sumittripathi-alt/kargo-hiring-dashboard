import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, tokenFor } from './lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/login')) return NextResponse.next();
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) {
    if (process.env.NODE_ENV === 'production') return new NextResponse('DASHBOARD_PASSWORD is not configured', { status: 503 });
    return NextResponse.next();
  }
  if (req.cookies.get(COOKIE)?.value === (await tokenFor(pw))) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
