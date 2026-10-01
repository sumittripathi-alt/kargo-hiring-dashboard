import './globals.css';
import type { Metadata, Viewport } from 'next';
import Nav from './Nav';

export const metadata: Metadata = { title: 'Kargo Hiring', description: 'Ranked shortlist, interview brief and draft email per candidate. The founder decides.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
