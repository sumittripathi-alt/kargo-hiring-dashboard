import { NextResponse } from 'next/server';

// The dashboard is open (no password), at the founder's request.
// Nothing is ever sent without an explicit "Confirm & send" click, and test sends are routed by EMAIL_OVERRIDE_TO.
export function middleware() {
  return NextResponse.next();
}
export const config = { matcher: [] };
