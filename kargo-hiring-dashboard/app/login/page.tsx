'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  async function go(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (r.ok) location.href = '/'; else setErr('Wrong password');
  }
  return (
    <form onSubmit={go} className="card" style={{ maxWidth: 360, margin: '80px auto' }}>
      <h1>Kargo Hiring</h1>
      <p className="mute">Internal tool. Enter the password.</p>
      <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
      {err && <p className="err">{err}</p>}
      <p><button className="primary" type="submit">Enter</button></p>
    </form>
  );
}
