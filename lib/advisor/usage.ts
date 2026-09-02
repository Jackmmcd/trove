import { db } from '@/lib/supabase/admin';

/**
 * Daily spend ceiling for Analyst.
 *
 * Designed to cost nothing in latency:
 *  - The check is a single indexed primary-key read, issued *alongside* the
 *    corpus and profile fetches the route already awaits. It resolves well
 *    inside that window, so it adds no wall-clock time.
 *  - Recording happens after the stream closes and is never awaited by the
 *    response path.
 *  - A soft in-process cache means bursts of turns on one instance skip the
 *    read entirely.
 *
 * It is a ceiling, not a quota: a turn already in flight is never interrupted,
 * and the cap is checked before starting a new one. Overshoot is bounded by one
 * turn per concurrent request, which is the right trade — cutting someone off
 * mid-answer to save a few cents is worse than the few cents.
 */

// Opus 5: $5/MTok in, $25/MTok out. Cache reads bill at 0.1x, writes at 1.25x.
const IN_PER_TOKEN = 5 / 1e6;
const OUT_PER_TOKEN = 25 / 1e6;

function capUsd(): number {
  const raw = Number(process.env.ANALYST_DAILY_USD_CAP);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function estimateCost(u: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): number {
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return input * IN_PER_TOKEN
    + output * OUT_PER_TOKEN
    + read * IN_PER_TOKEN * 0.1
    + write * IN_PER_TOKEN * 1.25;
}

// Soft cache so repeated turns on a warm instance skip the round trip.
let cached: { day: string; spent: number; at: number } | null = null;
const CACHE_MS = 20_000;

export interface CapStatus { allowed: boolean; spent: number; cap: number }

/** Read today's spend. Safe to call in parallel with other preamble queries. */
export async function checkDailyCap(): Promise<CapStatus> {
  const cap = capUsd();
  const day = today();

  if (cached && cached.day === day && Date.now() - cached.at < CACHE_MS) {
    return { allowed: cached.spent < cap, spent: cached.spent, cap };
  }

  try {
    const { data } = await db
      .from('analyst_usage').select('est_cost_usd').eq('day', day).maybeSingle();
    const spent = data?.est_cost_usd ?? 0;
    cached = { day, spent, at: Date.now() };
    return { allowed: spent < cap, spent, cap };
  } catch {
    // Never let a ledger outage take Analyst down — fail open and log.
    console.error('analyst_usage read failed; allowing turn');
    return { allowed: true, spent: 0, cap };
  }
}

/**
 * Record a completed turn. Fire-and-forget — callers must not await this on the
 * response path.
 */
export async function recordUsage(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
} | null): Promise<void> {
  if (!usage) return;
  const cost = estimateCost(usage);
  try {
    const { data, error } = await db.rpc('analyst_record_usage', {
      p_day: today(),
      p_input: usage.input_tokens ?? 0,
      p_output: usage.output_tokens ?? 0,
      p_cache_read: usage.cache_read_input_tokens ?? 0,
      p_cache_write: usage.cache_creation_input_tokens ?? 0,
      p_cost: cost,
    });
    if (error) { console.error('analyst_record_usage:', error.message); return; }
    if (typeof data === 'number') cached = { day: today(), spent: data, at: Date.now() };
  } catch (e) {
    console.error('analyst_record_usage threw:', e);
  }
}
