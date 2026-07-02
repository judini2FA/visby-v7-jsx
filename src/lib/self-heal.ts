import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';

// The dispatcher half of the self-healing loop: it reads OPEN rows from the bug_reports triage queue,
// dedupes by root-cause fingerprint, and fires a GitHub `repository_dispatch` so the self-heal workflow
// (claude-code-action) can open a REVIEWED pull request. It never touches code itself and never merges
// anything — it only moves a report from 'open' to 'triaged' and hands off. Fail-soft: a no-op (leaves
// rows 'open' to retry) when the GitHub repo/token env isn't configured.

const EVENT_TYPE = 'self-heal';

// A stable id for a bug's root cause so N reports of the same underlying issue don't each spawn a PR.
// Deliberately coarse (source + normalized title) — better to over-dedupe than flood review with dupes.
export function fingerprintReport(r: { source: string; title?: string | null }): string {
  const basis = `${r.source}\n${(r.title ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200)}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

type DispatchSummary = { scanned: number; dispatched: number; deduped: number; skipped: number; error?: string };

async function fireRepositoryDispatch(repo: string, token: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'visby-self-heal',
      },
      body: JSON.stringify({ event_type: EVENT_TYPE, client_payload: payload }),
    });
    return res.status === 204; // GitHub returns 204 No Content on a successful dispatch
  } catch {
    return false;
  }
}

export async function dispatchQueuedReports(opts: { limit?: number; dailyCap?: number } = {}): Promise<DispatchSummary> {
  const limit = opts.limit ?? 10;
  const dailyCap = opts.dailyCap ?? 5;
  const repo = process.env.SELF_HEAL_REPO;        // 'owner/repo'
  const token = process.env.SELF_HEAL_GH_TOKEN;   // fine-grained PAT, Contents: write (to trigger dispatch)
  const supabase = createServiceClient();
  const summary: DispatchSummary = { scanned: 0, dispatched: 0, deduped: 0, skipped: 0 };

  if (!repo || !token) { summary.error = 'SELF_HEAL_REPO / SELF_HEAL_GH_TOKEN not set'; return summary; }

  // Daily cap bounds cost + review load: count how many were already handed off in the last 24h.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: dispatchedToday, error: capErr } = await supabase
    .from('bug_reports').select('id', { count: 'exact', head: true })
    .not('dispatched_at', 'is', null).gte('dispatched_at', since);
  if (capErr) console.warn('[self-heal] daily-cap query failed (is migration_self_heal run?):', capErr.message);
  let budget = Math.max(0, dailyCap - (dispatchedToday ?? 0));

  const { data: rows, error: rowsErr } = await supabase
    .from('bug_reports').select('id, source, title, detail, attempts')
    .eq('status', 'open').order('created_at', { ascending: true }).limit(limit);
  if (rowsErr) { summary.error = `queue read failed: ${rowsErr.message}`; return summary; }

  for (const r of rows ?? []) {
    summary.scanned++;
    const fp = fingerprintReport(r);

    // Dedup: if the same root cause is already in-flight or fixed, dismiss this duplicate instead of
    // opening a second PR for it.
    const { data: dupe } = await supabase
      .from('bug_reports').select('id').eq('fingerprint', fp)
      .in('status', ['triaged', 'proposed', 'resolved']).limit(1);
    if (dupe && dupe.length) {
      await supabase.from('bug_reports').update({ status: 'dismissed', fingerprint: fp }).eq('id', r.id);
      summary.deduped++;
      continue;
    }

    if (budget <= 0) { summary.skipped++; continue; } // cap reached — leave 'open' for the next run

    const ok = await fireRepositoryDispatch(repo, token, {
      report_id: r.id,
      source: r.source,
      title: (r.title ?? '').slice(0, 200),
      detail: (r.detail ?? '').slice(0, 2000),
    });

    if (ok) {
      await supabase.from('bug_reports').update({
        status: 'triaged',
        fingerprint: fp,
        dispatched_at: new Date().toISOString(),
        attempts: ((r.attempts as number) ?? 0) + 1,
      }).eq('id', r.id);
      summary.dispatched++; budget--;
    } else {
      summary.skipped++; // GitHub call failed — leave 'open' to retry next run
    }
  }

  return summary;
}
