import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import Logout from './Logout';

export const metadata: Metadata = { title: 'Kargo Hiring', description: 'Ranked shortlist, brief and draft email per candidate. The founder decides.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <b>Kargo Hiring</b>
          <Link href="/">Upload</Link>
          <Link href="/dashboard">Dashboard</Link>
          <span className="sp" />
          <Logout />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
