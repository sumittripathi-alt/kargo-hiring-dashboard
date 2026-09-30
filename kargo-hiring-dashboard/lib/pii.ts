// Deterministic PII handling. The LLM is only ever used to *find* identifiers in the CV header;
// the actual removal is done here in code, so a model slip cannot leak an identifier downstream.
export type PII = { name: string; email: string; phone: string };

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi;
const STOP = /^(resume|curriculum|vitae|cv|profile|summary|experience|education|skills|contact|professional|product|manager|senior|strategy|operations|leader|associate|engineer|lead|head|founder|work|page)$/i;

export function findEmails(text: string): string[] {
  return [...new Set((text.match(EMAIL_RE) || []).map((e) => e.toLowerCase()))];
}

// CV layouts often duplicate/garble the phone (e.g. "98202 / 98202 / 11345 / 11345"). Conservative: header only,
// standalone 10-digit mobiles, "+91 XXXXX XXXXX", or a de-duplicated pair of 5-digit groups.
export function findPhone(text: string): string {
  const head = text.slice(0, 700);
  const m1 = head.match(/(?<!\d)(?:\+?91[\s-]?)?([6-9]\d{4})[\s-]?(\d{5})(?!\d)/);
  const groups: string[] = [];
  for (const t of head.match(/(?<!\d)\d{5}(?!\d)/g) || []) if (groups[groups.length - 1] !== t) groups.push(t);
  if (m1 && !(m1[1] === m1[2])) return m1[1] + m1[2];
  for (let i = 0; i + 1 < groups.length; i++) if (/^[6-9]/.test(groups[i])) return groups[i] + groups[i + 1];
  return '';
}

function titleCase(s: string) {
  return s.replace(/[-_.]+/g, ' ').trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function fallbackName(text: string, fileName?: string): string {
  const slug = text.match(/linkedin\.com\/in\/([a-z0-9-]+)/i)?.[1];
  if (slug) {
    const parts = slug.split('-').filter((p) => /^[a-z]+$/i.test(p) && !/^(pm|product|ops|logistics|cs|sales|mktg|growth|dev|ceo|hr|in)$/i.test(p));
    if (parts.length >= 2) return titleCase(parts.slice(0, 3).join(' '));
  }
  for (const line of text.split('\n').slice(0, 15).map((l) => l.trim())) {
    if (/^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,3}$/.test(line) && !line.split(/\s+/).some((w) => STOP.test(w))) {
      return titleCase(line);
    }
  }
  if (fileName) {
    const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/^(?:pm|spm)?_?\d+_/i, '');
    if (/[a-z]/i.test(base)) return titleCase(base);
  }
  return '';
}

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function scrub(text: string, pii: PII): string {
  let t = text;
  // links first (LinkedIn/GitHub handles usually contain the name)
  t = t.replace(/https?:\/\/\S+/gi, '[LINK]');
  t = t.replace(/\b(?:www\.)?(?:linkedin|github|twitter|x|medium|behance|dribbble|leetcode|kaggle|gitlab|instagram|facebook)\.com\/\S*/gi, '[LINK]');
  t = t.replace(/\b(?:linkedin|github)\b\s*:?\s*[a-z0-9-]*name[a-z0-9-]*/gi, '[LINK]');
  // emails
  const emails = new Set([...findEmails(t), pii.email.toLowerCase()].filter(Boolean));
  t = t.replace(EMAIL_RE, '[EMAIL]');
  for (const e of emails) t = t.replace(new RegExp(esc(e), 'gi'), '[EMAIL]');
  // phone: full forms, then leftover fragments that are substrings of the real number
  const digits = pii.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  t = t.replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[PHONE]');
  if (digits.length >= 10) {
    t = t.replace(/\d{5,}/g, (m) => (digits.includes(m) || m.includes(digits) ? '[PHONE]' : m));
    t = t.replace(/(?<![\d.])\+?91(?![\d])(?=\s*(?:\[PHONE\]|\|))/g, '');
  }
  t = t.replace(/(?:\[PHONE\][\s|,•·-]*){2,}/g, '[PHONE] ');
  // name: every token, case-insensitive. Long tokens match anywhere (catches "ROHANMehta"); short tokens (3-4 letters)
  // must not sit inside a longer word. Two passes so glued forms like "KumarRAVI" resolve once the neighbour is gone.
  const tokens = pii.name.split(/[\s.'-]+/).filter((w) => w.length >= 3).sort((x, y) => y.length - x.length);
  for (let pass = 0; pass < 2; pass++) {
    for (const tok of tokens) {
      if (tok.length >= 5) { t = t.replace(new RegExp(esc(tok), 'gi'), '[CANDIDATE]'); continue; }
      t = t.replace(new RegExp(esc(tok), 'gi'), (m, off: number, str: string) =>
        /[A-Za-z]/.test(str[off - 1] || '') || /[A-Za-z]/.test(str[off + m.length] || '') ? m : '[CANDIDATE]');
    }
  }
  t = t.replace(/(?:\[CANDIDATE\][\s|,•·-]*){2,}/g, '[CANDIDATE] ');
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function leakCheck(scrubbed: string, pii: PII): string[] {
  const leaks: string[] = [];
  if (EMAIL_RE.test(scrubbed)) leaks.push('email');
  EMAIL_RE.lastIndex = 0;
  const digits = pii.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (digits && scrubbed.replace(/\D/g, '').includes(digits)) leaks.push('phone');
  for (const tok of pii.name.split(/[\s.'-]+/).filter((w) => w.length >= 3)) {
    if (tok.length >= 5 ? new RegExp(esc(tok), 'i').test(scrubbed) : [...scrubbed.matchAll(new RegExp(esc(tok), 'gi'))].some((m) => !/[A-Za-z]/.test(scrubbed[(m.index ?? 0) - 1] || '') && !/[A-Za-z]/.test(scrubbed[(m.index ?? 0) + m[0].length] || ''))) leaks.push('name:' + tok);
  }
  return leaks;
}
