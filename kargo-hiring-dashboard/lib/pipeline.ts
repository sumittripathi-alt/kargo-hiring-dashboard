import { createHash } from 'crypto';
import { db } from './supabase';
import { fileToText, sanitize } from './parse';
import { findEmails, findPhone, fallbackName, scrub, leakCheck, PII } from './pii';
import { geminiJson, S } from './gemini';
import { loadRubric, weightedTotal, Role, Criterion } from './rubric';

const FOUNDER = 'Arjun Mehta, Founder, Kargo';
export const TOP_N = () => parseInt(process.env.TOP_N || '5', 10);
// Safety floor: a top-N slot is not enough for an interview invite if the role score is below this (0 disables).
export const MIN_INVITE_SCORE = () => { const v = parseFloat(process.env.MIN_INVITE_SCORE ?? '25'); return Number.isFinite(v) ? v : 25; };

/* ---------- Step 0: text + PII split (the only step that sees identifiers) ---------- */
async function findIdentifiers(raw: string, fileName: string, buf: Buffer, mime: string): Promise<PII> {
  // Real-world CV PDFs often keep the contact header in layers text extractors drop, so for PDFs the extraction step
  // reads the document itself. This is the ONLY AI call that sees identifiers. Its output is only used to locate them;
  // removal from the CV text is done in code (see scrub).
  const schema = S.obj({ name: S.str, email: S.str, phone: S.str });
  const system =
    'Extract the candidate contact details from this CV. name: full name, proper case, no titles. email: exactly as written. ' +
    'phone: the mobile number as 10 digits (drop +91 and spaces). Use an empty string if not present. Return only what is written in the document.';
  let ai: { name?: string; email?: string; phone?: string } = {};
  try {
    const isPdf = /pdf/i.test(mime + fileName);
    ai = await geminiJson({
      system,
      prompt: isPdf ? 'CV document attached.' : raw.slice(0, 2000),
      schema,
      inlineFile: isPdf ? { mimeType: 'application/pdf', dataBase64: buf.toString('base64') } : undefined,
    });
  } catch (e) {
    // Fail closed: guessing the name with regexes can leave the real name in the stored CV text.
    throw new Error('Could not extract contact details (' + (e as Error).message + '); nothing was stored');
  }
  const email = (ai.email || '').trim().toLowerCase().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ? ai.email!.trim().toLowerCase() : findEmails(raw)[0] || '';
  let phone = (ai.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) phone = findPhone(raw);
  let name = (ai.name || '').trim();
  if (name.length < 3) name = fallbackName(raw, fileName);
  if (!name) throw new Error('Could not identify the candidate name in this CV');
  if (!email) throw new Error('No email address found in this CV, so the candidate could not be contacted');
  return { name, email, phone };
}

export async function ingest(buf: Buffer, fileName: string, mime: string, role: Role) {
  let raw = await fileToText(buf, fileName, mime);
  if (raw.replace(/\s/g, '').length < 200) {
    if (!/pdf/i.test(mime + fileName)) throw new Error('CV has too little text to read');
    // scanned PDF: OCR through Gemini (this is part of the extraction step; output is scrubbed in code below)
    const r = await geminiJson<{ text: string }>({
      prompt: 'Transcribe this CV to plain text, preserving everything.',
      schema: S.obj({ text: S.str }),
      inlineFile: { mimeType: 'application/pdf', dataBase64: buf.toString('base64') },
    });
    raw = r.text;
    if (raw.replace(/\s/g, '').length < 200) throw new Error('CV has too little text to read');
  }
  raw = sanitize(raw);
  const found = await findIdentifiers(raw, fileName, buf, mime);
  const pii = { name: sanitize(found.name).trim(), email: sanitize(found.email).trim(), phone: sanitize(found.phone).trim() };
  const clean = scrub(raw, pii);
  const leaks = leakCheck(clean, pii);
  if (leaks.length) throw new Error('PII scrub incomplete (' + leaks.join(', ') + '); refusing to store');
  const hash = createHash('sha256').update(clean).digest('hex');

  const { data: existing } = await db().from('candidates').select('id').eq('content_hash', hash).maybeSingle();
  if (existing) return { id: existing.id as string, duplicate: true };

  const { data, error } = await db()
    .from('candidates')
    .insert({ applied_role: role, personal_details: pii, cv_content: clean, content_hash: hash })
    .select('id')
    .single();
  if (error) throw new Error('db insert failed: ' + error.message);
  return { id: data.id as string, duplicate: false };
}

/* ---------- Step 1: score against BOTH rubrics ---------- */
function rubricText(label: string, cs: Criterion[]) {
  return `${label} RUBRIC\n` + cs.map((c, i) => `${i + 1}. ${c.name} (weight ${c.weight}%)\n${c.description}`).join('\n\n');
}

export async function scoreCandidate(id: string) {
  const { data: c, error } = await db().from('candidates').select('id, cv_content').eq('id', id).single();
  if (error || !c) throw new Error('candidate not found');
  try {
    const rubric = await loadRubric();
    const item = S.obj({ criterion: S.str, score: S.int, reason: S.str });
    const out = await geminiJson<{ PM: any[]; SPM: any[] }>({
      system:
        'You score CVs against a hiring rubric. Score ONLY on evidence written in the CV. Do not reward keywords, buzzwords or seniority titles. ' +
        'Do not infer gender, age, ethnicity, or use college prestige. The CV has had personal identifiers removed. ' +
        'Score each criterion 0-10: 0 = no evidence; 1-3 = vague or weak evidence; 4-6 = one clear concrete example; 7-8 = strong, specific, matches the description; 9-10 = exceptional, multiple verifiable examples. ' +
        'Each reason is ONE sentence (max 30 words) citing what in the CV drove the score (or its absence). Use the exact criterion names.',
      prompt:
        `${rubricText('PM', rubric.PM)}\n\n${rubricText('SPM', rubric.SPM)}\n\n` +
        `Score this candidate against every criterion of BOTH rubrics.\n\nCV:\n"""\n${c.cv_content}\n"""`,
      schema: S.obj({ PM: S.arr(item), SPM: S.arr(item) }),
    });
    const pm = weightedTotal(rubric.PM, out.PM);
    const spm = weightedTotal(rubric.SPM, out.SPM);
    const norm = (cs: Criterion[], rows: any[]) =>
      cs.map((k) => {
        const r = rows.find((x) => String(x.criterion).trim().toLowerCase() === k.name.toLowerCase());
        return { criterion: k.name, weight: k.weight, score: Math.max(0, Math.min(10, Number(r?.score ?? 0))), reason: String(r?.reason ?? 'No assessment returned') };
      });
    await db().from('candidates').update({
      score_json: { PM: norm(rubric.PM, out.PM), SPM: norm(rubric.SPM, out.SPM) },
      pm_score: pm, spm_score: spm, pipeline_status: 'scored', error: null,
    }).eq('id', id);
  } catch (e) {
    await db().from('candidates').update({ pipeline_status: 'error', error: (e as Error).message.slice(0, 500) }).eq('id', id);
    throw e;
  }
}

/* ---------- Steps 2+3: brief and email drafts, driven by ranking ---------- */
type Row = {
  id: string; applied_role: Role; personal_details: PII; cv_content: string; score_json: any;
  pm_score: number; spm_score: number; tier: 'invite' | 'reject' | null; tier_override: boolean;
  brief: string | null; email_type: string | null; email_body: string | null; email_edited: boolean; email_status: string;
};
const roleScore = (r: Row) => Number(r.applied_role === 'PM' ? r.pm_score : r.spm_score);

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  }));
}

async function makeBrief(r: Row) {
  const sc = r.score_json[r.applied_role] as any[];
  const out = await geminiJson<{ brief: string }>({
    system:
      'You write interview briefs for a founder who has 2 minutes. Exactly THREE sentences, plain language: ' +
      '(1) who the candidate is and why the system ranked them here; (2) the strongest concrete evidence from the CV; (3) the one or two specific things to probe in the interview (gaps, unclear claims). ' +
      'Refer to them as "the candidate". Never invent facts not in the CV. No bullet points.',
    prompt: `Role applied for: ${r.applied_role}\nRole score: ${roleScore(r)}/100\nCriterion scores:\n${sc.map((s) => `- ${s.criterion}: ${s.score}/10 - ${s.reason}`).join('\n')}\n\nCV:\n"""\n${r.cv_content}\n"""`,
    schema: S.obj({ brief: S.str }),
  });
  await db().from('candidates').update({ brief: out.brief.trim() }).eq('id', r.id);
}

async function makeEmail(r: Row, type: 'invite' | 'reject') {
  const roleName = r.applied_role === 'PM' ? 'Product Manager' : 'Senior Product Manager';
  const sc = r.score_json[r.applied_role] as any[];
  const strengths = [...sc].sort((a, b) => b.score - a.score).slice(0, 2).map((s) => s.reason).join(' ');
  const out = await geminiJson<{ subject: string; body: string }>({
    system:
      `You draft emails from ${FOUNDER}, a Series A logistics SaaS in Mumbai, to job applicants. Warm, direct, human, under 140 words, plain text. ` +
      'Start with exactly "Dear {{NAME}}," (keep that placeholder verbatim, it is replaced by code). ' +
      `End with a sign-off from ${FOUNDER}. ` +
      'Reference ONE or TWO specific things from the CV so it is clearly not a template. Never invent facts and never overclaim fit (no "exactly what we need"). Do not mention scores, rubrics, rankings, AI, or other candidates. ' +
      (type === 'invite'
        ? 'This is an INTERVIEW INVITE: say what stood out, propose a 30-minute conversation, ask them to reply with times that work. Do not invent dates or links.'
        : 'This is a REJECTION: thank them sincerely for applying for the role, be honest that they are not moving forward right now, name one genuine strength, and wish them well. No false promises of future contact.'),
    prompt: `Role: ${roleName}\nWhat stood out: ${strengths}\n\nCV:\n"""\n${r.cv_content}\n"""`,
    schema: S.obj({ subject: S.str, body: S.str }),
  });
  let body = out.body.trim();
  if (!body.includes('{{NAME}}')) body = `Dear {{NAME}},\n\n${body}`;
  body = body.replace(/\{\{NAME\}\}/g, r.personal_details.name); // real name from stored personal details
  await db().from('candidates').update({
    email_type: type, email_subject: out.subject.trim(), email_body: body, email_edited: false, email_status: 'draft', email_error: null,
  }).eq('id', r.id);
}

/** Idempotent: ranks per role, assigns the line, then generates whatever drafts are missing/stale (max `limit` candidates per call). */
export async function finalize(limit = 6) {
  const { data, error } = await db().from('candidates').select('*').eq('pipeline_status', 'scored');
  if (error) throw new Error(error.message);
  const rows = (data || []) as Row[];
  const N = TOP_N();
  for (const role of ['PM', 'SPM'] as Role[]) {
    const ranked = rows.filter((r) => r.applied_role === role).sort((a, b) => roleScore(b) - roleScore(a));
    ranked.forEach((r, i) => {
      if (r.tier_override) return;
      const want = i < N && roleScore(r) >= MIN_INVITE_SCORE() ? 'invite' : 'reject';
      if (r.tier !== want) { r.tier = want; }
    });
  }
  // persist tiers
  await Promise.all(rows.map((r) => db().from('candidates').update({ tier: r.tier }).eq('id', r.id)));

  const todo = rows.filter((r) => r.email_status !== 'sent' && r.tier && (r.email_type !== r.tier || !r.email_body || (r.tier === 'invite' && !r.brief)));
  const batch = todo.slice(0, limit);
  const errors: string[] = [];
  await pool(batch, 3, async (r) => {
    try {
      const tier = r.tier!;
      if (tier === 'invite' && !r.brief) await makeBrief(r);
      if (tier === 'reject' && r.brief) await db().from('candidates').update({ brief: null }).eq('id', r.id);
      if (r.email_type !== tier || !r.email_body) await makeEmail(r, tier);
    } catch (e) { errors.push(`${r.personal_details.name}: ${(e as Error).message}`); }
  });
  return { remaining: Math.max(0, todo.length - batch.length), processed: batch.length, errors };
}
