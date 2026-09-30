'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Score = { criterion: string; weight: number; score: number; reason: string };
type C = {
  id: string; applied_role: 'PM' | 'SPM'; personal_details: { name: string; email: string; phone: string }; cv_content: string;
  pipeline_status: string; error: string | null; score_json: { PM: Score[]; SPM: Score[] } | null; pm_score: number | null; spm_score: number | null;
  tier: 'invite' | 'reject' | null; tier_override: boolean; brief: string | null; email_type: string | null; email_subject: string | null; email_body: string | null;
  email_edited: boolean; email_status: 'draft' | 'sent' | 'failed'; email_error: string | null; sent_at: string | null; sent_to: string | null;
};

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j };
}
const rs = (c: C) => Number(c.applied_role === 'PM' ? c.pm_score : c.spm_score);

function Card({ c, rank, reload }: { c: C; rank: number; reload: () => void }) {
  const [subject, setSubject] = useState(c.email_subject || '');
  const [body, setBody] = useState(c.email_body || '');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { setSubject(c.email_subject || ''); setBody(c.email_body || ''); }, [c.email_subject, c.email_body]);
  const other = c.applied_role === 'PM' ? 'SPM' : 'PM';
  const sent = c.email_status === 'sent';
  const dirty = subject !== (c.email_subject || '') || body !== (c.email_body || '');

  async function save() { setBusy('save'); const r = await post('/api/draft', { id: c.id, subject, body }); setMsg(r.ok ? 'Saved' : r.error); setBusy(''); reload(); }
  async function send() {
    if (dirty) { const s = await post('/api/draft', { id: c.id, subject, body }); if (!s.ok) { setMsg(s.error); return; } }
    setBusy('send'); setMsg('');
    const r = await post('/api/send', { id: c.id, reviewed });
    setMsg(r.ok ? `Sent to ${r.to}` : r.error); setBusy(''); reload();
  }
  async function move(tier: 'invite' | 'reject') {
    setBusy('move'); await post('/api/override', { id: c.id, tier });
    await post('/api/finalize', { limit: 3 }); setBusy(''); reload();
  }

  return (
    <details className="card cand">
      <summary>
        <span className="rank">{rank}</span>
        <span><span className="nm">{c.personal_details.name}</span><br /><span className="mute" style={{ fontSize: 13 }}>{c.tier_override ? 'moved by you' : ''}</span></span>
        {sent && <span className="badge">Sent</span>}
        {c.email_status === 'failed' && <span className="badge b">Send failed</span>}
        {!sent && c.email_body && <span className="badge w">Draft ready</span>}
        <span className="sc"><span className="big">{rs(c).toFixed(1)}</span><span className="mute"> /100 {c.applied_role}</span><br />
          <span className="mute" style={{ fontSize: 13 }}>as {other}: {Number(other === 'PM' ? c.pm_score : c.spm_score).toFixed(1)}</span></span>
      </summary>
      <div className="body">
        {c.brief && <div className="brief"><b>Interview brief</b><br />{c.brief}</div>}
        <h2>Why ranked here ({c.applied_role} rubric)</h2>
        <table><thead><tr><th>Criterion</th><th>Score</th><th>Weight</th><th>Reason</th></tr></thead><tbody>
          {c.score_json?.[c.applied_role].map((s) => <tr key={s.criterion}><td>{s.criterion}</td><td>{s.score}/10</td><td>{s.weight}%</td><td>{s.reason}</td></tr>)}
        </tbody></table>
        <details style={{ marginTop: 8 }}><summary className="mute" style={{ cursor: 'pointer' }}>Also scored on the {other} rubric</summary>
          <table><tbody>{c.score_json?.[other].map((s) => <tr key={s.criterion}><td>{s.criterion}</td><td>{s.score}/10</td><td>{s.weight}%</td><td>{s.reason}</td></tr>)}</tbody></table>
        </details>
        <details style={{ marginTop: 8 }}><summary className="mute" style={{ cursor: 'pointer' }}>Anonymised CV text (what the AI saw)</summary><pre className="cv">{c.cv_content}</pre></details>

        <h2>Draft email — {c.email_type === 'invite' ? 'interview invite' : c.email_type === 'reject' ? 'rejection' : 'pending'} <span className="mute" style={{ fontWeight: 400 }}>to {c.personal_details.email}</span></h2>
        {c.email_body ? (
          <>
            <input type="text" value={subject} disabled={sent} onChange={(e) => setSubject(e.target.value)} style={{ marginBottom: 8 }} />
            <textarea value={body} disabled={sent} onChange={(e) => setBody(e.target.value)} />
            {c.email_error && <p className="err">Last error: {c.email_error}</p>}
            {!sent ? (
              <div className="row" style={{ marginTop: 10 }}>
                {c.email_type === 'reject' && <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I reviewed this candidate and confirm the rejection</label>}
                <button className="primary" disabled={!!busy || (c.email_type === 'reject' && !reviewed)} onClick={send}>{busy === 'send' ? 'Sending…' : 'Confirm & send'}</button>
                <button disabled={!dirty || !!busy} onClick={save}>Save edits</button>
                {c.tier === 'reject' ? <button disabled={!!busy} onClick={() => move('invite')}>Move to shortlist</button> : <button disabled={!!busy} onClick={() => move('reject')}>Move below the line</button>}
                <span className="mute">{msg}</span>
              </div>
            ) : <p className="ok">Sent to {c.sent_to} on {new Date(c.sent_at!).toLocaleString()}</p>}
          </>
        ) : <p className="mute">Draft not generated yet. Use “Generate drafts” above.</p>}
      </div>
    </details>
  );
}

export default function Dashboard() {
  const [list, setList] = useState<C[]>([]);
  const [role, setRole] = useState<'PM' | 'SPM'>('PM');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [working, setWorking] = useState('');

  const load = useCallback(async () => {
    const r = await fetch('/api/candidates', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) setErr(j.error); else { setList(j.candidates); setErr(''); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const scored = useMemo(() => list.filter((c) => c.pipeline_status === 'scored'), [list]);
  const bad = list.filter((c) => c.pipeline_status !== 'scored');
  const ranked = useMemo(() => scored.filter((c) => c.applied_role === role).sort((a, b) => rs(b) - rs(a)), [scored, role]);
  const top = ranked.filter((c) => c.tier === 'invite');
  const below = ranked.filter((c) => c.tier !== 'invite');
  const pending = scored.filter((c) => c.email_status !== 'sent' && (!c.email_body || c.email_type !== c.tier)).length;
  const sentCount = list.filter((c) => c.email_status === 'sent').length;

  async function generate() {
    for (let i = 0; i < 40; i++) {
      setWorking('Generating drafts…');
      const j = await post('/api/finalize', { limit: 6 });
      await load();
      if (!j.ok) { setWorking('Failed: ' + j.error); return; }
      if (!j.remaining) break;
      setWorking(`Generating drafts… ${j.remaining} left`);
    }
    setWorking('');
  }
  async function retry(id: string) { setWorking('Re-scoring…'); await post('/api/retry', { id }); await generate(); }

  if (loading) return <p className="mute">Loading…</p>;
  return (
    <>
      <h1>Dashboard</h1>
      <p className="mute">{scored.length} scored · {sentCount} emails sent · {pending} drafts pending. The system recommends; nothing is sent until you click Confirm.</p>
      {err && <p className="err">{err}</p>}
      <div className="row"><button onClick={generate} disabled={!!working}>Generate drafts</button><button onClick={load}>Refresh</button><span className="mute">{working}</span></div>
      <div className="tabs">
        {(['PM', 'SPM'] as const).map((r) => <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{r === 'PM' ? 'Product Manager' : 'Senior Product Manager'} ({scored.filter((c) => c.applied_role === r).length})</button>)}
      </div>
      <h2>Shortlist — top {top.length}</h2>
      {top.length === 0 && <p className="mute">No candidates on the shortlist yet.</p>}
      {top.map((c, i) => <Card key={c.id + c.email_type + c.email_status} c={c} rank={ranked.indexOf(c) + 1} reload={load} />)}
      <h2>Below the line — {below.length} <span className="mute" style={{ fontWeight: 400 }}>review once; rejections need your confirmation</span></h2>
      {below.map((c) => <Card key={c.id + c.email_type + c.email_status} c={c} rank={ranked.indexOf(c) + 1} reload={load} />)}
      {bad.length > 0 && (<><h2>Not scored</h2>
        <table><tbody>{bad.map((c) => <tr key={c.id}><td>{c.personal_details.name} ({c.applied_role})</td><td className="err">{c.error || c.pipeline_status}</td><td><button onClick={() => retry(c.id)}>Retry</button></td></tr>)}</tbody></table></>)}
    </>
  );
}
