// Offline test: no AI. Uses the filename as ground-truth name and checks nothing identifying survives scrubbing.
import fs from 'node:fs';
import path from 'node:path';
import { fileToText } from '../lib/parse';
import { findEmails, findPhone, fallbackName, scrub, leakCheck } from '../lib/pii';

const dir = process.argv[2] || '/mnt/user-data/uploads/resumes_';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort();
let bad = 0, nameMiss = 0;
(async () => {
  for (const f of files) {
    const raw = await fileToText(fs.readFileSync(path.join(dir, f)), f, 'application/pdf');
    const truth = f.replace(/\.pdf$/, '').replace(/^(?:pm_|spm_)?\d+_/, '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    const email = findEmails(raw)[0] || '';
    const phone = findPhone(raw) || '0000000000';
    const fb = fallbackName(raw); // fallback heuristic WITHOUT filename
    const fbOk = fb.toLowerCase() === truth.toLowerCase();
    if (!fbOk) nameMiss++;
    const pii = { name: truth, email, phone };
    const clean = scrub(raw, pii);
    const leaks = leakCheck(clean, pii);
    const flags = [!email && 'NO_EMAIL', !phone && 'NO_PHONE', leaks.length && 'LEAK:' + leaks.join(','), clean.length < 800 && 'SHORT'].filter(Boolean);
    if (leaks.length || !email || !phone) bad++;
    console.log(f.padEnd(32), String(raw.length).padStart(5), '->', String(clean.length).padStart(5), phone || '-', '| fallback name:', fb || '-', fbOk ? '' : '(differs)', flags.join(' '));
  }
  console.log(`\n${files.length} files; ${bad} with leaks/missing email|phone; fallback name heuristic missed ${nameMiss}`);
})();
