'use client';
export default function Logout() {
  return (
    <button onClick={async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login'; }} style={{ padding: '4px 10px' }}>
      Log out
    </button>
  );
}
