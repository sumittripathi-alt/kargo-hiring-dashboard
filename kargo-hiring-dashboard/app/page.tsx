'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';

type Item = { name: string; role: 'PM' | 'SPM'; file: File; state: 'queued' | 'working' | 'done' | 'dup' | 'error'; msg?: string };

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

export default function Upload() {
  const [role, setRole] = useState<'PM' | 'SPM' | ''>('');
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<'idle' | 'scoring' | 'drafting' | 'done'>('idle');
  const [drafting, setDrafting] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function patch(i: number, p: Partial<Item>) { setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x))); }

  async function run(files: File[]) {
    if (!role) { alert('Select the role these CVs applied for first.'); return; }
    const start = items.length;
    const list: Item[] = files.map((f) => ({ name: f.name, role: role as 'PM' | 'SPM', file: f, state: 'queued' }));
    setItems((xs) => [...xs, ...list]);
    setPhase('scoring');
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const k = next++; const idx = start + k; const it = list[k];
        patch(idx, { state: 'working' });
        const fd = new FormData(); fd.append('file', it.file); fd.append('role', it.role);
        try {
          const r = await fetch('/api/upload', { method: 'POST', body: fd });
          const j = await r.json().catch(() => ({ error: 'Server error (' + r.status + ')' }));
          if (!r.ok) patch(idx, { state: 'error', msg: j.error });
          else patch(idx, { state: j.duplicate ? 'dup' : 'done', msg: j.duplicate ? 'already uploaded' : undefined });
        } catch (e) { patch(idx, { state: 'error', msg: (e as Error).message }); }
      }
    };
    await Promise.all([worker(), worker()]);
    setPhase('drafting');
    for (let guard = 0; guard < 40; guard++) {
      setDrafting('Drafting briefs and emails…');
      const j = await post('/api/finalize', { limit: 6 });
      if (j.error) { setDrafting('Draft step failed: ' + j.error); break; }
      if (j.errors?.length) setDrafting('Some drafts failed, will retry from the dashboard: ' + j.errors[0]);
      if (!j.remaining) break;
      setDrafting(`Drafting… ${j.remaining} left`);
    }
    setPhase('done');
  }

  const done = items.filter((x) => x.state === 'done' || x.state === 'dup').length;
  return (
    <>
      <h1>Upload CVs</h1>
      <p className="mute">Pick the role the candidate applied for, then drop PDF / DOCX / TXT files (up to 4 MB each). Personal details are split off before any AI step. Everything is scored against both rubrics.</p>
      <div className="row" style={{ margin: '14px 0' }}>
        <label>Applied role:</label>
        <select value={role} onChange={(e) => setRole(e.target.value as any)} style={{ width: 280 }}>
          <option value="">Select…</option>
          <option value="PM">Product Manager (PM)</option>
          <option value="SPM">Senior Product Manager (SPM)</option>
        </select>
      </div>
      <div className={'drop' + (over ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); run([...e.dataTransfer.files]); }}>
        <p>Drag CVs here</p>
        <button className="primary" disabled={!role || phase === 'scoring' || phase === 'drafting'} onClick={() => input.current?.click()}>Choose files</button>
        <input ref={input} type="file" multiple accept=".pdf,.docx,.txt" hidden onChange={(e) => { run([...(e.target.files || [])]); e.target.value = ''; }} />
      </div>
      {items.length > 0 && (
        <>
          <h2>{done}/{items.length} processed {phase === 'drafting' && <span className="mute"> · {drafting}</span>} {phase === 'done' && <span className="ok"> · all drafts ready — <Link href="/dashboard">open dashboard</Link></span>}</h2>
          <table className="q"><tbody>
            {items.map((x, i) => (
              <tr key={i}><td>{x.name}</td><td>{x.role}</td>
                <td className={x.state === 'error' ? 'err' : x.state === 'done' ? 'ok' : 'mute'}>{x.state}{x.msg ? ' — ' + x.msg : ''}</td></tr>
            ))}
          </tbody></table>
        </>
      )}
    </>
  );
}
