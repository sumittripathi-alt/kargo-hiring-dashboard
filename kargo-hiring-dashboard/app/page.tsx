'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';

type Role = 'PM' | 'SPM';
type State = 'queued' | 'working' | 'done' | 'dup' | 'error';
type Item = { name: string; role: Role; file: File; state: State; msg?: string };

const MAX = 4_000_000;
const OK_EXT = /\.(pdf|docx|txt)$/i;

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) { location.href = '/login'; return { error: 'Session expired' }; }
  return r.json().catch(() => ({ error: 'Server error (' + r.status + ')' }));
}

export default function Upload() {
  const [role, setRole] = useState<Role | ''>('');
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<'idle' | 'scoring' | 'drafting' | 'done'>('idle');
  const [note, setNote] = useState('');
  const [draftIssues, setDraftIssues] = useState(0);
  const [over, setOver] = useState(false);
  const [hint, setHint] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = phase === 'scoring' || phase === 'drafting';

  function patch(i: number, p: Partial<Item>) { setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x))); }

  async function run(all: File[]) {
    if (busy) return;
    if (!role) { setHint('Choose the role first, then add the CVs.'); return; }
    setHint('');
    if (!all.length) return;
    const start = items.length;
    const list: Item[] = all.map((f) => {
      const bad = !OK_EXT.test(f.name) ? 'Only PDF, DOCX or TXT files' : f.size > MAX ? 'Over 4 MB' : f.size === 0 ? 'File is empty' : '';
      return { name: f.name, role, file: f, state: bad ? 'error' : 'queued', msg: bad || undefined };
    });
    setItems((xs) => [...xs, ...list]);
    setPhase('scoring'); setDraftIssues(0);

    const todo = list.map((it, k) => k).filter((k) => list[k].state === 'queued');
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const k = todo[next++]; const idx = start + k; const it = list[k];
        patch(idx, { state: 'working' });
        const fd = new FormData(); fd.append('file', it.file); fd.append('role', it.role);
        try {
          const r = await fetch('/api/upload', { method: 'POST', body: fd });
          if (r.status === 401) { location.href = '/login'; return; }
          const j = await r.json().catch(() => ({ error: r.status === 413 ? 'File too large for the server' : 'Server error (' + r.status + ')' }));
          if (!r.ok) patch(idx, { state: 'error', msg: friendly(j.error) });
          else patch(idx, { state: j.duplicate ? 'dup' : 'done', msg: j.duplicate ? 'Already uploaded' : undefined });
        } catch (e) { patch(idx, { state: 'error', msg: 'Network problem. Try this file again.' }); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);

    setPhase('drafting'); let problems = 0;
    for (let guard = 0; guard < 60; guard++) {
      setNote('Writing briefs and emails…');
      const j = await post('/api/finalize', { limit: 6 });
      if (j.error) { setNote('Drafting stopped: ' + friendly(j.error)); problems++; break; }
      if (j.errors?.length) problems += j.errors.length;
      if (!j.remaining) break;
      setNote(`Writing briefs and emails… ${j.remaining} to go`);
    }
    setDraftIssues(problems);
    setPhase('done'); setNote('');
  }

  const total = items.length;
  const finished = items.filter((x) => x.state === 'done' || x.state === 'dup' || x.state === 'error').length;
  const okCount = items.filter((x) => x.state === 'done' || x.state === 'dup').length;
  const failed = items.filter((x) => x.state === 'error').length;

  return (
    <>
      <h1>Add candidates</h1>
      <p className="lead">Drop CVs for one role at a time. Names and contact details are separated and kept private before any AI reads the CV. Every candidate is scored against both roles.</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <span className="small mute">Applying for</span>
        <div className="seg" role="radiogroup" aria-label="Role applied for">
          {(['PM', 'SPM'] as Role[]).map((r) => (
            <button key={r} role="radio" aria-checked={role === r} className={role === r ? 'on' : ''} disabled={busy} onClick={() => { setRole(r); setHint(''); }}>
              {r === 'PM' ? 'Product Manager' : 'Senior Product Manager'}
            </button>
          ))}
        </div>
      </div>

      <div className={'drop' + (over ? ' over' : '') + (!role ? ' off' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); run([...e.dataTransfer.files]); }}>
        <div className="big">{role ? 'Drop CVs here' : 'Choose a role to begin'}</div>
        <p className="mute small" style={{ margin: '0 0 18px' }}>PDF, DOCX or TXT · up to 4 MB each · many at once is fine</p>
        <button className="primary" disabled={busy} onClick={() => (role ? input.current?.click() : setHint('Choose the role first, then add the CVs.'))}>Choose files</button>
        <input ref={input} type="file" multiple accept=".pdf,.docx,.txt" hidden onChange={(e) => { run([...(e.target.files || [])]); e.target.value = ''; }} />
        {hint && <p className="err small" role="alert" style={{ margin: '14px 0 0' }}>{hint}</p>}
      </div>

      {total > 0 && (
        <>
          <h2>Progress <span className="line" /></h2>
          <div className="card">
            <div style={{ padding: '14px 16px 0' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{finished} of {total} processed</b>
                <span className="small mute">{phase === 'drafting' ? note : phase === 'done' ? '' : phase === 'scoring' ? 'Reading and scoring…' : ''}</span>
              </div>
              <div className="progress"><i style={{ width: `${Math.round((finished / total) * 100)}%` }} /></div>
            </div>
            <div style={{ marginTop: 8 }}>
              {items.map((x, i) => (
                <div className="file" key={i}>
                  <div style={{ minWidth: 0 }}>
                    <div className="fn">{x.name}</div>
                    {x.msg && <div className={'small ' + (x.state === 'error' ? 'err' : 'mute')}>{x.msg}</div>}
                  </div>
                  <span className={'chip ' + (x.state === 'error' ? 'b' : x.state === 'done' ? '' : 'n')}>
                    {x.state === 'working' && <span className="spin" />}
                    {{ queued: 'Waiting', working: 'Reading', done: 'Scored', dup: 'Duplicate', error: 'Needs attention' }[x.state]}
                    <span className="faint">· {x.role}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {phase === 'done' && (
            <div className="row" style={{ marginTop: 18 }}>
              <Link href="/dashboard"><button className="primary">Open the shortlist →</button></Link>
              <span className="small mute">
                {failed === 0 && draftIssues === 0
                  ? `${okCount} candidates ready. Nothing is sent until you confirm it.`
                  : [`${okCount} ready`, failed ? `${failed} file(s) need attention` : '', draftIssues ? 'some drafts failed, retry them with “Write drafts” on the shortlist' : ''].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}

function friendly(m?: string) {
  if (!m) return 'Something went wrong';
  if (/too little text/i.test(m)) return 'This CV has no readable text (a scan or an image?)';
  if (/No email/i.test(m)) return 'No email address found, so the candidate cannot be contacted';
  if (/candidate name/i.test(m)) return 'Could not find the candidate name';
  if (/PII scrub/i.test(m)) return 'Could not safely remove personal details, so this CV was not stored';
  if (/Gemini/i.test(m) || /Could not extract/i.test(m)) return 'The AI service did not respond. Try again in a minute.';
  return m.length > 140 ? m.slice(0, 140) + '…' : m;
}
