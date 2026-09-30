import { NextRequest, NextResponse } from 'next/server';
import { scoreCandidate } from '@/lib/pipeline';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    await scoreCandidate(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
