-- Kargo hiring dashboard schema. Run in Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('PM','SPM')),
  position int not null,
  name text not null,
  description text not null,
  weight int not null check (weight between 1 and 100),
  unique (role, name)
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  applied_role text not null check (applied_role in ('PM','SPM')),
  -- PII lives ONLY here. Never sent to any AI step after extraction.
  personal_details jsonb not null,
  -- CV text with name/email/phone/links removed. This is the only CV text AI ever scores.
  cv_content text not null,
  content_hash text not null unique,
  pipeline_status text not null default 'uploaded' check (pipeline_status in ('uploaded','scored','error')),
  error text,
  score_json jsonb,
  pm_score numeric,
  spm_score numeric,
  tier text check (tier in ('invite','reject')),
  tier_override boolean not null default false,
  brief text,
  email_type text check (email_type in ('invite','reject')),
  email_subject text,
  email_body text,
  email_edited boolean not null default false,
  email_status text not null default 'draft' check (email_status in ('draft','sent','failed')),
  email_error text,
  sent_at timestamptz,
  sent_to text,
  resend_id text,
  created_at timestamptz not null default now()
);

create index if not exists candidates_role_idx on candidates (applied_role);

-- Lock both tables: only the server (service role key) can read/write. The anon key gets nothing.
alter table rubric_criteria enable row level security;
alter table candidates enable row level security;

-- "Automatically expose new tables" is off for this project, so grant the server role explicitly.
grant usage on schema public to service_role;
grant all on table rubric_criteria, candidates to service_role;
