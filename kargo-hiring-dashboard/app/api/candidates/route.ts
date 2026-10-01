import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { TOP_N, MIN_INVITE_SCORE } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await db().from('candidates')
    .select('id, applied_role, personal_details, cv_content, pipeline_status, error, score_json, pm_score, spm_score, tier, tier_override, brief, email_type, email_subject, email_body, email_edited, email_status, email_error, sent_at, sent_to, created_at')
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidates: data, config: { topN: TOP_N(), minScore: MIN_INVITE_SCORE() } });
}
