/**
 * The order list a basket is recorded with while its orders are being placed.
 *
 * A basket is written to the database before its first order goes out, with
 * every leg 'queued', and rewritten as each leg resolves. Closing the tab or
 * losing signal mid-way then leaves a basket that owns exactly the legs that
 * filled, instead of filled positions with no basket around them. Readers
 * (lib/baskets/group.ts, the Baskets page) count only 'done' legs, so queued
 * and failed ones never read as holdings.
 */

export type LegStatus = 'queued' | 'done' | 'error';

export interface BasketLeg {
  ticker: string;
  shares: number;
  price: number;
  status: LegStatus;
}

export function queuedLedger(lines: { ticker: string; sharesToBuy: number; price: number | null }[]): BasketLeg[] {
  return lines
    .filter(l => l.sharesToBuy > 0)
    .map(l => ({ ticker: l.ticker, shares: l.sharesToBuy, price: l.price ?? 0, status: 'queued' as const }));
}

export function settleLeg(ledger: BasketLeg[], ticker: string, status: Exclude<LegStatus, 'queued'>): BasketLeg[] {
  return ledger.map(l => (l.ticker === ticker ? { ...l, status } : l));
}

/** Server-side shape check: the client reports the legs, so refuse anything malformed. */
export function isLedger(v: unknown): v is BasketLeg[] {
  return Array.isArray(v) && v.every(l =>
    l && typeof l === 'object' &&
    typeof (l as BasketLeg).ticker === 'string' &&
    Number.isFinite((l as BasketLeg).shares) &&
    Number.isFinite((l as BasketLeg).price) &&
    ['queued', 'done', 'error'].includes((l as BasketLeg).status));
}
