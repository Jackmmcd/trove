import { db } from '@/lib/supabase/admin';

/**
 * The per-turn block: everything that varies by user or by day.
 *
 * This is rendered AFTER the cached digest, never inside it. Putting today's
 * date or a portfolio value into the cached prefix would invalidate the whole
 * 27-fund corpus on every request.
 */

export interface DeclaredProfile {
  horizon?: string;            // e.g. "10+ years"
  max_drawdown?: string;       // e.g. "-25%"
  goal?: string;               // "growth" | "income" | "balanced"
  avoid?: string[];            // sectors or themes
  max_position_pct?: number;   // comfortable single-position ceiling
  experience?: string;         // "none" | "some" | "experienced"
}

export interface DerivedProfile {
  band: 'conservative' | 'balanced' | 'aggressive' | 'unknown';
  positions: number;
  equityValue: number;
  cash: number;
  cashPct: number;
  hhi: number;
  largest: { ticker: string; pct: number } | null;
  concentrationTop3: number;
  contradictions: string[];
}

/** Herfindahl index over position weights: 1.0 = one holding, ~0 = many equal. */
function hhi(weights: number[]): number {
  return weights.reduce((s, w) => s + (w / 100) ** 2, 0);
}

export async function deriveProfile(userId: string, declared: DeclaredProfile): Promise<DerivedProfile> {
  const [{ data: account }, { data: positions }] = await Promise.all([
    db.from('paper_accounts').select('cash').eq('user_id', userId).maybeSingle(),
    db.from('paper_positions').select('symbol, quantity, avg_open_price').eq('user_id', userId),
  ]);

  const rows = positions ?? [];
  const cash = account?.cash ?? 0;

  // Cost basis, not market value. The chat route enriches with live prices when
  // available; this stays dependency-free so the profile can always be computed.
  const valued = rows.map(p => ({
    ticker: p.symbol,
    value: Math.abs((p.quantity ?? 0) * (p.avg_open_price ?? 0)),
  }));
  const equityValue = valued.reduce((s, p) => s + p.value, 0);
  const total = equityValue + cash;

  const weights = valued.map(p => (equityValue > 0 ? (p.value / equityValue) * 100 : 0));
  const sorted = [...valued].sort((a, b) => b.value - a.value);
  const largest = sorted[0] && equityValue > 0
    ? { ticker: sorted[0].ticker, pct: (sorted[0].value / equityValue) * 100 }
    : null;
  const concentrationTop3 = equityValue > 0
    ? (sorted.slice(0, 3).reduce((s, p) => s + p.value, 0) / equityValue) * 100
    : 0;

  const index = hhi(weights);
  let band: DerivedProfile['band'] = 'unknown';
  if (rows.length > 0) {
    if (index >= 0.30 || concentrationTop3 >= 70) band = 'aggressive';
    else if (index >= 0.15) band = 'balanced';
    else band = 'conservative';
  }

  // Surfaced, never silently reconciled — the gap between what someone says and
  // what they hold is usually the most useful thing in the profile.
  const contradictions: string[] = [];
  if (declared.max_position_pct && largest && largest.pct > declared.max_position_pct) {
    contradictions.push(
      `Stated a ${declared.max_position_pct}% ceiling per position; largest holding ${largest.ticker} is ${largest.pct.toFixed(1)}% of equity.`
    );
  }
  if (declared.goal === 'income' && band === 'aggressive') {
    contradictions.push('Stated an income goal, but the portfolio is concentrated in a way that reads as growth-seeking.');
  }
  if (declared.max_drawdown && /(-|\b)(5|10)%/.test(declared.max_drawdown) && band === 'aggressive') {
    contradictions.push(`Stated a shallow drawdown tolerance (${declared.max_drawdown}) alongside a concentrated portfolio.`);
  }

  return {
    band,
    positions: rows.length,
    equityValue,
    cash,
    cashPct: total > 0 ? (cash / total) * 100 : 0,
    hhi: index,
    largest,
    concentrationTop3,
    contradictions,
  };
}

export async function getProfile(userId: string) {
  const { data } = await db
    .from('investor_profiles')
    .select('declared, derived, derived_at')
    .eq('user_id', userId)
    .maybeSingle();

  const declared: DeclaredProfile = data?.declared ?? {};
  const derived = await deriveProfile(userId, declared);

  await db.from('investor_profiles').upsert(
    { user_id: userId, declared, derived, derived_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );

  return { declared, derived };
}

/** Render the volatile block. Goes in `messages`, never in cached `system`. */
export function renderProfileBlock(
  declared: DeclaredProfile,
  derived: DerivedProfile,
  watched: string[]
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = ['<session_context>', `Today: ${today}`];

  const d: string[] = [];
  if (declared.horizon) d.push(`horizon ${declared.horizon}`);
  if (declared.max_drawdown) d.push(`tolerates ${declared.max_drawdown}`);
  if (declared.goal) d.push(declared.goal);
  if (declared.max_position_pct) d.push(`max single position ${declared.max_position_pct}%`);
  if (declared.experience) d.push(`experience: ${declared.experience}`);
  if (declared.avoid?.length) d.push(`avoids ${declared.avoid.join(', ')}`);
  lines.push(d.length ? `Declared: ${d.join(' · ')}` : 'Declared: not yet completed — ask before assuming anything about risk tolerance.');

  if (derived.positions === 0) {
    lines.push('Portfolio: empty paper account — no derived risk signals available.');
  } else {
    lines.push(
      `Derived: ${derived.band.toUpperCase()} · ${derived.positions} positions · ` +
      `$${derived.equityValue.toFixed(0)} equity, ${derived.cashPct.toFixed(1)}% cash · ` +
      `HHI ${derived.hhi.toFixed(2)} · top-3 = ${derived.concentrationTop3.toFixed(1)}%` +
      (derived.largest ? ` · largest ${derived.largest.ticker} ${derived.largest.pct.toFixed(1)}%` : '')
    );
  }

  lines.push(watched.length ? `Follows ${watched.length} funds: ${watched.join(', ')}` : 'Follows no funds yet.');
  for (const c of derived.contradictions) lines.push(`<flag>${c}</flag>`);
  lines.push('</session_context>');
  return lines.join('\n');
}
