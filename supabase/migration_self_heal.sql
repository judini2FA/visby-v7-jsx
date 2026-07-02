-- Self-healing autofixer: extends the bug_reports triage queue so the dispatcher can carry a report
-- through open → triaged (handed to the fixer) → proposed (PR opened) → resolved/dismissed, dedupe by
-- root-cause fingerprint, and record the resulting PR. Additive + idempotent; reuses the existing
-- status column (open | triaged | proposed | resolved | dismissed).
alter table bug_reports add column if not exists fingerprint   text;
alter table bug_reports add column if not exists pr_url        text;
alter table bug_reports add column if not exists attempts      int not null default 0;
alter table bug_reports add column if not exists dispatched_at timestamptz;

create index if not exists bug_reports_fingerprint_idx on bug_reports (fingerprint);
