import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

export async function fileToText(buf: Buffer, fileName: string, mime: string): Promise<string> {
  const n = fileName.toLowerCase();
  if (n.endsWith('.pdf') || mime === 'application/pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join('\n') : text).replace(/\r/g, '');
  }
  if (n.endsWith('.docx')) {
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value;
  }
  if (n.endsWith('.txt') || n.endsWith('.md') || mime.startsWith('text/')) return buf.toString('utf8');
  throw new Error('Unsupported file type. Upload PDF, DOCX or TXT.');
}

/** Postgres text cannot hold NUL, and stray control chars / lone surrogates break JSON. Keep tabs and newlines. */
export function sanitize(t: string): string {
  return (t || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
