import { groupPositions, type BasketRecord, type BrokerPosition } from '../group';

function pos(overrides: Partial<BrokerPosition> & { symbol: string; quantity: number }): BrokerPosition {
  const avgOpenPrice = overrides.avgOpenPrice ?? 100;
  const currentPrice = overrides.currentPrice ?? 110;
  return {
    avgOpenPrice,
    currentPrice,
    totalValue: currentPrice * overrides.quantity,
    gainLoss: (currentPrice - avgOpenPrice) * overrides.quantity,
    dailyPnL: null,
    weeklyPnL: null,
    ...overrides,
  };
}

function basket(id: string, orders: Array<[string, number, number]>, extra: Partial<BasketRecord> = {}): BasketRecord {
  return {
    id,
    fundId: 'f1',
    fundName: `Fund ${id}`,
    placedAt: '2026-01-01T00:00:00Z',
    orders: orders.map(([ticker, shares, price]) => ({ ticker, shares, price, status: 'done' })),
    ...extra,
  };
}

describe('groupPositions', () => {
  it('folds basket legs into one row and leaves the rest standalone', () => {
    const rows = groupPositions(
      [pos({ symbol: 'AAA', quantity: 2, avgOpenPrice: 50, currentPrice: 60 }), pos({ symbol: 'BBB', quantity: 1 })],
      [basket('b1', [['AAA', 2, 50]])],
    );

    expect(rows).toHaveLength(2);
    const group = rows.find(r => r.kind === 'basket');
    expect(group).toMatchObject({ kind: 'basket', id: 'b1', cost: 100, totalValue: 120, gainLoss: 20 });
    expect(rows.find(r => r.kind === 'single')).toMatchObject({ position: { symbol: 'BBB' } });
  });

  it('splits a symbol held both inside and outside a basket', () => {
    const rows = groupPositions(
      [pos({ symbol: 'AAA', quantity: 10, avgOpenPrice: 100, currentPrice: 110 })],
      [basket('b1', [['AAA', 4, 100]])],
    );

    const group = rows.find(r => r.kind === 'basket');
    const single = rows.find(r => r.kind === 'single');
    expect(group).toMatchObject({ totalValue: 440 });
    // The 6 shares no basket claimed stay a position in their own right.
    expect(single).toMatchObject({ position: { quantity: 6, totalValue: 660, gainLoss: 60 } });
  });

  it('clamps a basket to shares actually held after a manual sell', () => {
    const rows = groupPositions(
      [pos({ symbol: 'AAA', quantity: 1, avgOpenPrice: 100, currentPrice: 100 })],
      [basket('b1', [['AAA', 5, 100], ['GONE', 3, 20]])],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'basket', cost: 100, totalValue: 100 });
    // The symbol no longer held is dropped, not counted at its purchase price.
    expect(rows[0].kind === 'basket' && rows[0].legs.map(l => l.symbol)).toEqual(['AAA']);
  });

  it('ignores sold baskets so their shares return to the flat list', () => {
    const rows = groupPositions(
      [pos({ symbol: 'AAA', quantity: 2 })],
      [basket('b1', [['AAA', 2, 100]], { soldAt: '2026-02-01T00:00:00Z' })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('single');
  });

  it('gives the oldest basket first claim on contested shares', () => {
    const rows = groupPositions(
      [pos({ symbol: 'AAA', quantity: 3, currentPrice: 10 })],
      [
        basket('new', [['AAA', 3, 10]], { placedAt: '2026-03-01T00:00:00Z' }),
        basket('old', [['AAA', 2, 10]], { placedAt: '2026-01-01T00:00:00Z' }),
      ],
    );

    const groups = rows.filter(r => r.kind === 'basket');
    const byId = Object.fromEntries(groups.map(g => [(g as any).id, (g as any).legs[0].shares]));
    expect(byId).toEqual({ old: 2, new: 1 });
  });

  it('scales day and week P&L to the shares the basket owns', () => {
    const rows = groupPositions(
      [{ ...pos({ symbol: 'AAA', quantity: 10 }), dailyPnL: 20, weeklyPnL: -50 }],
      [basket('b1', [['AAA', 4, 100]])],
    );

    const group = rows.find(r => r.kind === 'basket') as any;
    expect(group.dailyPnL).toBeCloseTo(8);
    expect(group.weeklyPnL).toBeCloseTo(-20);
  });

  it('reports an unknown day move rather than a partial sum', () => {
    const rows = groupPositions(
      [
        { ...pos({ symbol: 'AAA', quantity: 1 }), dailyPnL: 5 },
        { ...pos({ symbol: 'BBB', quantity: 1 }), dailyPnL: null },
      ],
      [basket('b1', [['AAA', 1, 100], ['BBB', 1, 100]])],
    );

    const group = rows.find(r => r.kind === 'basket') as any;
    expect(group.dailyPnL).toBeNull();
  });

  it('preserves total portfolio value across the regrouping', () => {
    const positions = [
      pos({ symbol: 'AAA', quantity: 3, avgOpenPrice: 10, currentPrice: 12 }),
      pos({ symbol: 'BBB', quantity: 5, avgOpenPrice: 20, currentPrice: 18 }),
    ];
    const rows = groupPositions(positions, [basket('b1', [['AAA', 1, 10], ['BBB', 2, 20]])]);

    const flatTotal = positions.reduce((s, p) => s + p.totalValue, 0);
    const groupedTotal = rows.reduce(
      (s, r) => s + (r.kind === 'basket' ? r.totalValue : r.position.totalValue),
      0,
    );
    expect(groupedTotal).toBeCloseTo(flatTotal);
  });

  it('skips orders that never filled', () => {
    const rows = groupPositions(
      [pos({ symbol: 'AAA', quantity: 5 })],
      [{ ...basket('b1', [['AAA', 5, 100]]), orders: [{ ticker: 'AAA', shares: 5, price: 100, status: 'error' }] }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('single');
  });
});
