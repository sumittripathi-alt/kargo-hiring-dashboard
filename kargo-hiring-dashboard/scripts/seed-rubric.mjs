// Parses rubric.txt and upserts rows into rubric_criteria (one row per criterion per role).
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  if (fs.existsSync(f)) for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const txt = fs.readFileSync(process.argv[2] || 'rubric.txt', 'utf8');
const sections = { SPM: txt.split(/SENIOR PRODUCT MANAGER RUBRIC[^\n]*\n/)[1], PM: txt.split(/SENIOR PRODUCT MANAGER RUBRIC[^\n]*\n/)[0].split(/PRODUCT MANAGER RUBRIC[^\n]*\n/)[1] };
const rows = [];
for (const [role, body] of Object.entries(sections)) {
  if (!body) throw new Error('Could not find section for ' + role);
  const blocks = body.split(/Criterion name:\s*/).slice(1);
  let sum = 0;
  blocks.forEach((b, i) => {
    const name = b.split('\n')[0].trim();
    const desc = b.match(/What a strong candidate looks like:\s*([\s\S]*?)\nWeight:/)?.[1].trim().replace(/\s+/g, ' ');
    const weight = parseInt(b.match(/Weight:\s*(\d+)\s*%/)?.[1] || '', 10);
    if (!name || !desc || !weight) throw new Error(`Bad criterion block #${i + 1} in ${role}`);
    sum += weight; rows.push({ role, position: i + 1, name, description: desc, weight });
  });
  if (blocks.length < 4 || blocks.length > 6) throw new Error(`${role}: need 4-6 criteria, found ${blocks.length}`);
  if (sum !== 100) throw new Error(`${role}: weights sum to ${sum}, not 100`);
}
if (process.argv.includes('--dry')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error } = await db.from('rubric_criteria').upsert(rows, { onConflict: 'role,name' });
if (error) { console.error(error); process.exit(1); }
const { data } = await db.from('rubric_criteria').select('role,name,weight').order('role').order('position');
console.table(data);
