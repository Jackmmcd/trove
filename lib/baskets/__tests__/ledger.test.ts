import { queuedLedger, settleLeg, isLedger } from '../ledger';

describe('basket ledger', () => {
  const lines = [
    { ticker: 'AAPL', sharesToBuy: 2, price: 190 },
    { ticker: 'BRK.B', sharesToBuy: 0, price: 480 },
    { ticker: 'KO', sharesToBuy: 5, price: null },
  ];

  it('queues only legs that buy something', () => {
    expect(queuedLedger(lines)).toEqual([
      { ticker: 'AAPL', shares: 2, price: 190, status: 'queued' },
      { ticker: 'KO', shares: 5, price: 0, status: 'queued' },
    ]);
  });

  it('settles one leg without touching the others', () => {
    const settled = settleLeg(queuedLedger(lines), 'KO', 'done');
    expect(settled.map(l => l.status)).toEqual(['queued', 'done']);
  });

  it('accepts a well-formed ledger and rejects malformed ones', () => {
    expect(isLedger(queuedLedger(lines))).toBe(true);
    expect(isLedger([])).toBe(true);
    expect(isLedger('nope')).toBe(false);
    expect(isLedger([{ ticker: 'AAPL', shares: 'x', price: 1, status: 'done' }])).toBe(false);
    expect(isLedger([{ ticker: 'AAPL', shares: 1, price: 1, status: 'filled' }])).toBe(false);
  });
});
