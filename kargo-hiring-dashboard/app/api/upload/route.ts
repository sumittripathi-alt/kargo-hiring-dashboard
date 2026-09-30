import { NextRequest, NextResponse } from 'next/server';
import { ingest, scoreCandidate } from '@/lib/pipeline';

export const maxDuration = 300;
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const role = String(form.get('role') || '');
    if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file' }, { status: 400 });
    if (role !== 'PM' && role !== 'SPM') return NextResponse.json({ error: 'Select a role (PM or SPM)' }, { status: 400 });
    if (file.size > 4_000_000) return NextResponse.json({ error: 'File over 4 MB (hosting limit)' }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const { id, duplicate } = await ingest(buf, file.name, file.type, role);
    if (!duplicate) await scoreCandidate(id);
    return NextResponse.json({ id, duplicate });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
