import { db } from './supabase';

export type Criterion = { name: string; description: string; weight: number; position: number };
export type Rubric = { PM: Criterion[]; SPM: Criterion[] };
export type Role = 'PM' | 'SPM';

let cache: { at: number; r: Rubric } | null = null;

export async function loadRubric(): Promise<Rubric> {
  if (cache && Date.now() - cache.at < 60_000) return cache.r;
  const { data, error } = await db().from('rubric_criteria').select('*').order('position');
  if (error) throw new Error('rubric load failed: ' + error.message);
  const r: Rubric = { PM: [], SPM: [] };
  for (const row of data || []) (r[row.role as Role] as Criterion[]).push(row);
  if (!r.PM.length || !r.SPM.length) throw new Error('rubric_criteria is empty. Run `npm run seed`.');
  cache = { at: Date.now(), r };
  return r;
}

export function weightedTotal(role: Criterion[], scores: { criterion: string; score: number }[]): number {
  let t = 0;
  for (const c of role) {
    const s = scores.find((x) => x.criterion.trim().toLowerCase() === c.name.trim().toLowerCase());
    const v = Math.max(0, Math.min(10, Number(s?.score ?? 0)));
    t += (c.weight * v) / 10;
  }
  return Math.round(t * 10) / 10;
}
