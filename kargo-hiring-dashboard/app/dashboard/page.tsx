'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type Role = 'PM' | 'SPM';
type Score = { criterion: string; weight: number; score: number; reason: string };
type C = {
  id: string; applied_role: Role; personal_details: { name: string; email: string; phone: string }; cv_content: string;
  pipeline_status: string; error: string | null; score_json: { PM: Score[]; SPM: Score[] } | null; pm_score: number | null; spm_score: number | null;
  tier: 'invite' | 'reject' | null; tier_override: boolean; brief: string | null; email_type: string | null; email_subject: string | null; email_body: string | null;
  email_edited: boolean; email_status: 'draft' | 'sent' | 'failed'; email_error: string | null; sent_at: string | null; sent_to: string | null;
};
type Cfg = { topN: number; minScore: number };

async function post(url: string, body: unknown) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 401) { location.href = '/login'; return { ok: false, error: 'Session expired' }; }
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, ...j, error: r.ok ? undefined : j.error || 'Server error (' + r.status + ')' };
  } catch { return { ok: false, error: 'Cannot reach the server. Check your connection.' }; }
}
const rs = (c: C) => Number(c.applied_role === 'PM' ? c.pm_score : c.spm_score) || 0;
const os = (c: C) => Number(c.applied_role === 'PM' ? c.spm_score : c.pm_score) || 0;
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

function Ring({ value }: { value: number }) {
  const R = 22, L = 2 * Math.PI * R, v = Math.max(0, Math.min(100, value));
  return (
    <div className="ring num" role="img" aria-label={`Score ${fmt(value)} out of 100`}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--acc)" /><stop offset="1" stopColor="var(--acc2)" /></linearGradient></defs>
        <circle cx="26" cy="26" r={R} fill="none" stroke="var(--card2)" strokeWidth="4" />
        <circle cx="26" cy="26" r={R} fill="none" stroke="url(#rg)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(v / 100) * L} ${L}`} />
      </svg>
      <b>{Math.round(value)}</b>
    </div>
  );
}

function Card({ c, rank, top, reload, notify }: { c: C; rank: number; top: boolean; reload: () => Promise<void>; notify: (m: string) => void }) {
  const [subject, setSubject] = useState(c.email_subject || '');
  const [body, setBody] = useState(c.email_body || '');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { setSubject(c.email_subject || ''); setBody(c.email_body || ''); }, [c.email_subject, c.email_body]);
  const other: Role = c.applied_role === 'PM' ? 'SPM' : 'PM';
  const sent = c.email_status === 'sent';
  const dirty = subject !== (c.email_subject || '') || body !== (c.email_body || '');
  const mine = c.score_json?.[c.applied_role] || [];
  const theirs = c.score_json?.[other] || [];
  const isReject = c.email_type === 'reject';

  async function save() {
    setBusy('save'); setMsg('');
    const r = await post('/api/draft', { id: c.id, subject, body });
    setMsg(r.ok ? 'Saved' : r.error); setBusy(''); if (r.ok) await reload();
  }
  async function send() {
    setMsg('');
    if (!subject.trim() || !body.trim()) { setMsg('The email needs a subject and a message.'); return; }
    setBusy('send');
    if (dirty) { const s = await post('/api/draft', { id: c.id, subject, body }); if (!s.ok) { setMsg(s.error); setBusy(''); return; } }
    const r = await post('/api/send', { id: c.id, reviewed });
    setBusy('');
    if (r.ok) notify(`Sent to ${c.personal_details.name}`); else setMsg(r.error);
    await reload();
  }
  async function move(tier: 'invite' | 'reject') {
    setBusy('move'); setMsg('');
    const o = await post('/api/override', { id: c.id, tier });
    if (!o.ok) { setMsg(o.error); setBusy(''); return; }
    const f = await post('/api/finalize', { limit: 3 });
    if (!f.ok) setMsg('Moved. The new draft will be created when you press “Write drafts”.');
    setBusy(''); await reload();
  }

  return (
    <details className={'card cand' + (top ? ' top' : '')}>
      <summary>
        <span className="rank num">{rank}</span>
        <span style={{ minWidth: 0 }}>
          <span className="nm">{c.personal_details.name}</span><br />
          <span className="sub">{c.tier_override ? 'Moved by you · ' : ''}{c.applied_role === 'PM' ? 'Product Manager' : 'Senior PM'} · as {other}: <span className="num">{fmt(os(c))}</span></span>
        </span>
        <span className="bars" aria-hidden="true">
          {mine.map((s) => <span className="bar" key={s.criterion} title={`${s.criterion}: ${s.score}/10`}><i style={{ width: `${s.score * 10}%` }} /></span>)}
        </span>
        <span className="right">
          {sent ? <span className="chip"><span className="dot" />Sent</span>
            : c.email_status === 'failed' ? <span className="chip b">Send failed</span>
            : c.email_body ? <span className="chip w">Draft ready</span> : <span className="chip n">No draft yet</span>}
          <Ring value={rs(c)} />
        </span>
      </summary>

      <div className="body">
        {c.brief && <div className="brief"><span className="lbl">Interview brief</span>{c.brief}</div>}

        <h3>Why this score · {c.applied_role} rubric</h3>
        <div>
          {mine.map((s) => (
            <div className="crit" key={s.criterion}>
              <div><div className="cn">{s.criterion}</div><div className="cw">weight {s.weight}%</div></div>
              <div className="sc num">{s.score}<span className="faint">/10</span></div>
              <div className="why">{s.reason}</div>
            </div>
          ))}
        </div>
        <details className="more"><summary>Also scored against the {other} rubric ({fmt(os(c))}/100)</summary>
          {theirs.map((s) => (
            <div className="crit" key={s.criterion}>
              <div><div className="cn">{s.criterion}</div><div className="cw">weight {s.weight}%</div></div>
              <div className="sc num">{s.score}<span className="faint">/10</span></div>
              <div className="why">{s.reason}</div>
            </div>
          ))}
        </details>
        <details className="more"><summary>What the AI read (personal details removed)</summary><pre className="cv">{c.cv_content}</pre></details>

        <h3>{isReject ? 'Rejection email' : c.email_type === 'invite' ? 'Interview invite' : 'Email'}</h3>
        {c.email_body ? (
          <div className="mail">
            <div className="to">To {c.personal_details.name} · <span className="mono">{c.personal_details.email}</span></div>
            <input type="text" aria-label="Email subject" value={subject} disabled={sent} onChange={(e) => setSubject(e.target.value)} />
            <textarea aria-label="Email message" value={body} disabled={sent} onChange={(e) => setBody(e.target.value)} />
            {c.email_error && <p className="err small" style={{ margin: 0 }}>Last send error: {c.email_error}</p>}
            {!sent ? (
              <>
                {isReject && <label className="check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />I have looked at this candidate and want to send the rejection</label>}
                <div className="actions">
                  <button className="primary" disabled={!!busy || (isReject && !reviewed)} onClick={send}>{busy === 'send' ? 'Sending…' : 'Confirm & send'}</button>
                  <button disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save edits'}</button>
                  {c.tier === 'reject'
                    ? <button className="ghost" disabled={!!busy} onClick={() => move('invite')}>Move to shortlist</button>
                    : <button className="ghost" disabled={!!busy} onClick={() => move('reject')}>Move below the line</button>}
                  <span className={'small ' + (msg === 'Saved' ? 'ok' : 'err')} role="status">{msg}</span>
                </div>
              </>
            ) : <p className="ok" style={{ margin: '6px 0 0' }}>Sent to {c.sent_to} on {c.sent_at ? new Date(c.sent_at).toLocaleString() : ''}</p>}
          </div>
        ) : <p className="mute small">No draft yet. Press “Write drafts” at the top.</p>}
      </div>
    </details>
  );
}

export default function Dashboard() {
  const [list, setList] = useState<C[]>([]);
  const [cfg, setCfg] = useState<Cfg>({ topN: 5, minScore: 25 });
  const [role, setRole] = useState<Role>('PM');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [working, setWorking] = useState('');
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((m: string) => { setToast(m); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 3500); }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/candidates', { cache: 'no-store' });
      if (r.status === 401) { location.href = '/login'; return; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error || 'Could not load candidates (' + r.status + ')');
      else { setList(j.candidates || []); if (j.config) setCfg(j.config); setErr(''); }
    } catch { setErr('Cannot reach the server. Check your connection and press Refresh.'); }
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
  const roleCount = (r: Role) => scored.filter((c) => c.applied_role === r).length;

  async function generate() {
    setWorking('Writing drafts…');
    for (let i = 0; i < 60; i++) {
      const j = await post('/api/finalize', { limit: 6 });
      await load();
      if (!j.ok) { setWorking(''); notify('Could not finish: ' + j.error); return; }
      if (j.errors?.length) { setWorking(''); notify('Some drafts failed: ' + j.errors[0]); return; }
      if (!j.remaining) break;
      setWorking(`Writing drafts… ${j.remaining} to go`);
    }
    setWorking(''); notify('Drafts are up to date');
  }
  async function retry(id: string) {
    setWorking('Scoring again…');
    const r = await post('/api/retry', { id });
    if (!r.ok) { setWorking(''); notify('Still failing: ' + r.error); await load(); return; }
    await generate();
  }

  return (
    <>
      <h1>Shortlist</h1>
      <p className="lead">The system ranks and drafts. You decide. Nothing is sent until you press Confirm on a candidate.</p>

      {loading ? (<><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></>) : (
        <>
          {err && <div className="card" style={{ padding: '12px 16px', marginBottom: 16, borderColor: 'var(--bad)' }}><span className="err">{err}</span> <button className="ghost" onClick={load}>Try again</button></div>}

          <div className="stats">
            <div className="card stat"><b className="num">{scored.length}</b><span>Candidates scored</span></div>
            <div className="card stat"><b className="num">{scored.filter((c) => c.tier === 'invite').length}</b><span>On a shortlist</span></div>
            <div className="card stat"><b className="num">{pending}</b><span>Drafts to write</span></div>
            <div className="card stat"><b className="num">{sentCount}</b><span>Emails sent</span></div>
          </div>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="seg" role="tablist">
              {(['PM', 'SPM'] as Role[]).map((r) => (
                <button key={r} role="tab" aria-selected={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
                  {r === 'PM' ? 'Product Manager' : 'Senior Product Manager'} <span className="faint num">{roleCount(r)}</span>
                </button>
              ))}
            </div>
            <div className="row">
              {working && <span className="small mute"><span className="spin" /> {working}</span>}
              <button className="ghost" onClick={load} disabled={!!working}>Refresh</button>
              <button className="primary" onClick={generate} disabled={!!working}>Write drafts</button>
            </div>
          </div>

          {scored.length === 0 && bad.length === 0 ? (
            <div className="empty" style={{ marginTop: 28 }}>No candidates yet. <Link href="/" style={{ color: 'var(--acc)' }}>Add the first CVs →</Link></div>
          ) : (
            <>
              <h2>Interview shortlist · top {cfg.topN} <span className="line" /></h2>
              {top.length === 0 && <div className="empty">{ranked.length === 0 ? `No ${role} candidates yet.` : cfg.minScore > 0 ? `Nobody is on the shortlist yet. Press “Write drafts”. A candidate needs ${cfg.minScore}+ to be invited.` : 'Press “Write drafts” to build the shortlist.'}</div>}
              {top.map((c) => <Card key={c.id + c.email_type + c.email_status} c={c} rank={ranked.indexOf(c) + 1} top reload={load} notify={notify} />)}

              {below.length > 0 && (
                <>
                  <h2>Below the line · {below.length} <span className="small faint" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>review once, rejections wait for your confirmation</span><span className="line" /></h2>
                  {below.map((c) => <Card key={c.id + c.email_type + c.email_status} c={c} rank={ranked.indexOf(c) + 1} top={false} reload={load} notify={notify} />)}
                </>
              )}
            </>
          )}

          {bad.length > 0 && (
            <>
              <h2>Needs attention · {bad.length} <span className="line" /></h2>
              <div className="card">
                {bad.map((c) => (
                  <div className="file" key={c.id}>
                    <div style={{ minWidth: 0 }}><div className="nm">{c.personal_details?.name || 'Unknown'} <span className="faint small">· {c.applied_role}</span></div><div className="err small">{(c.error || c.pipeline_status).slice(0, 160)}</div></div>
                    <button disabled={!!working} onClick={() => retry(c.id)}>Retry</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
