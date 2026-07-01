-- Self-healing intake queue: Sentry errors + inbound help emails land here for triage. The auto-fix
-- automation (separate, needs a GitHub token + a Claude runner) reads 'open' rows, reproduces the bug
-- independently, and proposes a REVIEWED PR. Email content is untrusted data, never executed.
create table if not exists bug_reports (
  id         uuid primary key default gen_random_uuid(),
  source     text not null,                       -- 'sentry' | 'email'
  title      text,
  detail     text,
  reporter   text,                                -- sentry project, or the email sender (untrusted)
  status     text not null default 'open',        -- open | triaged | proposed | resolved | dismissed
  raw        jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_status_idx on bug_reports (status, created_at desc);

-- Service-role only (admin reads via the service client). No anon/auth policies.
alter table bug_reports enable row level security;
