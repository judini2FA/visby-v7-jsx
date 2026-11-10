import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as copy from './copy';

// Words that are either jargon a 15-year-old would trip on or claims the product can't back up.
const BANNED = [
  /solana/i, /\bSOL\b/, /ethereum/i, /bitcoin/i, /non-custodial/i, /trustless/i, /smart[- ]contract/i,
  /escrow/i, /arweave/i, /wallet address/i, /\bMPC\b/, /seed phrase/i, /royalt/i, /instant/i,
];

function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

describe('demo page wording', () => {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter(f => /\.(tsx?|ts)$/.test(f) && !f.endsWith('.test.ts'));

  it('has copy for six walkthrough steps and four sections', () => {
    expect(copy.WALKTHROUGH).toHaveLength(6);
    expect(copy.SECTIONS.map(s => s.id)).toEqual(['tally', 'money', 'resale', 'pay']);
    expect(copy.SECTIONS.map(s => s.steps.length)).toEqual([3, 3, 3, 4]);
  });

  it('keeps every sentence short', () => {
    for (const s of strings(copy)) {
      for (const sentence of s.split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(32);
    }
  });

  it('uses no banned words in copy', () => {
    for (const s of strings(copy)) for (const re of BANNED) expect(s, `"${s}" matches ${re}`).not.toMatch(re);
  });

  it('uses no banned words anywhere in the demo source', () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const re of BANNED) expect(src, `${f} matches ${re}`).not.toMatch(re);
    }
  });
});
