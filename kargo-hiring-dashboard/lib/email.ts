import { db } from './supabase';

export async function sendCandidateEmail(id: string) {
  const { data: c, error } = await db().from('candidates').select('*').eq('id', id).single();
  if (error || !c) throw new Error('candidate not found');
  if (c.email_status === 'sent') throw new Error('already sent');
  if (!c.email_body || !c.email_subject) throw new Error('no draft to send');
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');

  const intended: string = c.personal_details.email;
  const override = (process.env.EMAIL_OVERRIDE_TO || '').trim();
  const allowed = (process.env.ALLOWED_EMAIL_DOMAINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  let to = intended;
  let body: string = c.email_body;
  if (override) {
    to = override;
    body += `\n\n---\n[Test routing: this email was addressed to ${intended}]`;
  } else if (!allowed.includes((intended.split('@')[1] || '').toLowerCase())) {
    throw new Error(`Refusing to email ${intended}: domain not in ALLOWED_EMAIL_DOMAINS`);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Kargo Hiring <onboarding@resend.dev>',
      to: [to],
      subject: c.email_subject,
      text: body,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    await db().from('candidates').update({ email_status: 'failed', email_error: JSON.stringify(j).slice(0, 400) }).eq('id', id);
    throw new Error('Resend: ' + (j.message || res.status));
  }
  await db().from('candidates').update({
    email_status: 'sent', sent_at: new Date().toISOString(), sent_to: to, resend_id: j.id, email_error: null,
  }).eq('id', id);
  return { to, resendId: j.id };
}
