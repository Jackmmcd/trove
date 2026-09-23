/**
 * Folding basket-held shares out of the flat broker position list.
 *
 * A basket buy of $1,000 across 30 names leaves 30 fractional lines in the
 * account — 0.0265 COF, 0.0095 MELI — and none of them means anything on its
 * own. The basket is the position the user actually took, so the portfolio
 * shows the basket as one row and keeps the legs inside it.
 *
 * The broker only reports a total per symbol, so ownership has to be
 * reconstructed: shares are claimed by baskets in purchase order, oldest
 * first, and whatever is left over is a genuine standalone holding. Claims are
 * clamped to what is actually held, so a leg the user has since sold by hand,
 * or a basket order that never filled, shrinks the basket rather than
 * inventing shares that are not there.
 */

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  avgOpenPrice: number;
  currentPrice: number;
  totalValue: number;
  gainLoss: number;
  dailyPnL: number | null;
  weeklyPnL: number | null;
}

export interface BasketOrder {
  ticker: string;
  shares: number;
  price: number;
  status: string;
}

export interface BasketRecord {
  id: string;
  fundName: string;
  fundId: string;
  placedAt: string;
  orders: BasketOrder[];
  isPaper?: boolean;
  soldAt?: string | null;
}

/** One symbol inside a basket row, priced at the basket's own entry. */
export interface BasketLeg {
  symbol: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  value: number;
  gainLoss: number;
}

export interface BasketGroup {
  kind: 'basket';
  id: string;
  fundName: string;
  placedAt: string;
  legs: BasketLeg[];
  cost: number;
  totalValue: number;
  gainLoss: number;
  dailyPnL: number | null;
  weeklyPnL: number | null;
}

export interface SingleRow {
  kind: 'single';
  position: BrokerPosition;
}

export type PortfolioRow = BasketGroup | SingleRow;

/** Floating-point share counts never land exactly on zero; treat dust as gone. */
const DUST = 1e-6;

/**
 * Per-share day and week P&L, derived from the whole-position figures the
 * dashboard already computed. Scaling these is what lets a basket report a day
 * move over the exact shares it owns rather than the whole symbol.
 */
function perShare(value: number | null, quantity: number): number | null {
  if (value === null || quantity === 0) return null;
  return value / quantity;
}

export function groupPositions(
  positions: BrokerPosition[],
  baskets: BasketRecord[],
): PortfolioRow[] {
  const remaining = new Map<string, number>();
  const bySymbol = new Map<string, BrokerPosition>();
  for (const p of positions) {
    remaining.set(p.symbol, (remaining.get(p.symbol) ?? 0) + p.quantity);
    bySymbol.set(p.symbol, p);
  }

  // Oldest first: the earliest basket has the strongest claim on shares that
  // are still held, so selling one basket does not silently re-attribute
  // another's legs on the next render.
  const open = baskets
    .filter(b => !b.soldAt)
    .slice()
    .sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime());

  const groups: BasketGroup[] = [];

  for (const basket of open) {
    const legs: BasketLeg[] = [];

    for (const order of basket.orders) {
      if (order.status !== 'done') continue;
      const held = remaining.get(order.ticker) ?? 0;
      const take = Math.min(order.shares, held);
      if (take <= DUST) continue;

      const pos = bySymbol.get(order.ticker)!;
      const currentPrice = pos.currentPrice;
      legs.push({
        symbol: order.ticker,
        shares: take,
        entryPrice: order.price,
        currentPrice,
        value: take * currentPrice,
        gainLoss: (currentPrice - order.price) * take,
      });
      remaining.set(order.ticker, held - take);
    }

    if (!legs.length) continue;

    // A single unpriced leg makes the basket's day move unknowable; reporting
    // the sum of the legs that do have one would understate it silently.
    let dailyPnL: number | null = 0;
    let weeklyPnL: number | null = 0;
    for (const leg of legs) {
      const pos = bySymbol.get(leg.symbol)!;
      const day = perShare(pos.dailyPnL, pos.quantity);
      const week = perShare(pos.weeklyPnL, pos.quantity);
      if (day === null) dailyPnL = null;
      else if (dailyPnL !== null) dailyPnL += day * leg.shares;
      if (week === null) weeklyPnL = null;
      else if (weeklyPnL !== null) weeklyPnL += week * leg.shares;
    }

    const cost = legs.reduce((s, l) => s + l.shares * l.entryPrice, 0);
    const totalValue = legs.reduce((s, l) => s + l.value, 0);

    groups.push({
      kind: 'basket',
      id: basket.id,
      fundName: basket.fundName,
      placedAt: basket.placedAt,
      legs,
      cost,
      totalValue,
      gainLoss: totalValue - cost,
      dailyPnL,
      weeklyPnL,
    });
  }

  // Whatever no basket claimed is a position the user holds in their own right.
  const singles: SingleRow[] = [];
  for (const p of positions) {
    const left = remaining.get(p.symbol) ?? 0;
    if (left <= DUST) continue;
    remaining.set(p.symbol, 0);

    const ratio = p.quantity === 0 ? 0 : left / p.quantity;
    singles.push({
      kind: 'single',
      position: left === p.quantity ? p : {
        ...p,
        quantity: left,
        totalValue: left * p.currentPrice,
        gainLoss: (p.currentPrice - p.avgOpenPrice) * left,
        dailyPnL: p.dailyPnL === null ? null : p.dailyPnL * ratio,
        weeklyPnL: p.weeklyPnL === null ? null : p.weeklyPnL * ratio,
      },
    });
  }

  // Baskets first — they are the larger, deliberate positions — then singles by
  // value, which is the order the flat table already implied.
  groups.sort((a, b) => b.totalValue - a.totalValue);
  singles.sort((a, b) => b.position.totalValue - a.position.totalValue);
  return [...groups, ...singles];
}

/**
 * What a basket is worth now, for the basket page itself, where there is no
 * broker position list to reconcile against — only what was filled at purchase.
 */
export function basketValue(
  orders: BasketOrder[],
  prices: Record<string, number>,
): { cost: number; value: number; gainLoss: number; gainPct: number } {
  const done = orders.filter(o => o.status === 'done');
  const cost = done.reduce((s, o) => s + o.shares * o.price, 0);
  const value = done.reduce((s, o) => s + o.shares * (prices[o.ticker] ?? o.price), 0);
  const gainLoss = value - cost;
  return { cost, value, gainLoss, gainPct: cost > 0 ? gainLoss / cost : 0 };
}
