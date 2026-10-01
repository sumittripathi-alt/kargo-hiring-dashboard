'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav() {
  const path = usePathname();
  return (
    <header className="nav">
      <Link href="/" className="brand"><span className="logo" />Kargo Hiring</Link>
      <Link href="/" className={'navlink' + (path === '/' ? ' on' : '')}>Upload</Link>
      <Link href="/dashboard" className={'navlink' + (path.startsWith('/dashboard') ? ' on' : '')}>Shortlist</Link>
      <span className="sp" />
    </header>
  );
}
