# Kargo Hiring Dashboard

Upload a CV and pick the role. The app splits personal details from the CV, scores the anonymised text against the PM and SPM rubrics (Gemini), ranks candidates per role, writes a 3-sentence brief for the shortlist, and drafts an invite or rejection for every candidate. **Nothing is sent until the founder clicks Confirm.** Rejections also require a review tick-box. There is no auto-rejection.

Stack: Next.js (Vercel) · Supabase Postgres · Gemini Flash · Resend.

## Setup
1. Supabase: run `supabase/schema.sql`, then `supabase/seed.sql` (rubric from `rubric.txt`) in the SQL editor.
2. Env vars (Vercel + `.env.local`, see `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `DASHBOARD_PASSWORD`; later `RESEND_API_KEY` and `EMAIL_OVERRIDE_TO` (your own address while testing).
3. `npm install && npm run dev`. `.env.local` is git-ignored.

## Privacy design (DPDP)
- `candidates.personal_details` holds name/email/phone; `candidates.cv_content` holds the scrubbed text. Every scoring/brief/email AI call receives only `cv_content`.
- Only the one-time identifier step reads the CV itself, and it is used only to locate identifiers. Removal is deterministic code (`lib/pii.ts`) plus a leak check that refuses to store a CV if identifiers remain.
- Tables have RLS on with no policies; only the server (service-role key) can read them.
- Gemini free tier may use inputs to improve Google's models; the billing-enabled API does not. Use billing for real candidate data.
- Emails can only go to `EMAIL_OVERRIDE_TO` or domains listed in `ALLOWED_EMAIL_DOMAINS`.

## Test
`npm run test:pii -- <folder of CV PDFs>` checks the scrub offline.
