import { NextRequest, NextResponse } from 'next/server';
import { finalize } from '@/lib/pipeline';

export const maxDuration = 300;
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { limit } = await req.json().catch(() => ({}));
    return NextResponse.json(await finalize(Math.min(Number(limit) || 6, 12)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
