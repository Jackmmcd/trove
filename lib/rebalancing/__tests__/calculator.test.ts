import { comparePortfolios } from '../calculator';
import type { CurrentPosition, TargetWeight, RebalanceConstraints } from '../types';

describe('comparePortfolios', () => {
  const mockCurrentPositions: CurrentPosition[] = [
    {
      ticker: 'AAPL',
      shares: 100,
      currentPrice: 150,
      currentValue: 15000,
      currentWeight: 50,
    },
    {
      ticker: 'MSFT',
      shares: 50,
      currentPrice: 300,
      currentValue: 15000,
      currentWeight: 50,
    },
  ];

  const mockTargetWeights: TargetWeight[] = [
    {
      ticker: 'AAPL',
      weight: 40,
      targetValue: 0, // Will be calculated
    },
    {
      ticker: 'MSFT',
      weight: 60,
      targetValue: 0, // Will be calculated
    },
  ];

  it('should generate trades when deviation exceeds threshold', async () => {
    const totalPortfolioValue = 30000;
    const availableCash = 10000;
    const constraints: RebalanceConstraints = {
      rebalanceThreshold: 5,
    };

    const trades = await comparePortfolios(
      mockCurrentPositions,
      mockTargetWeights,
      totalPortfolioValue,
      availableCash,
      constraints
    );

    expect(trades.length).toBeGreaterThan(0);
    expect(trades[0]).toHaveProperty('ticker');
    expect(trades[0]).toHaveProperty('action');
    expect(trades[0]).toHaveProperty('shares');
  });

  it('should not generate trades when deviation is below threshold', async () => {
    const totalPortfolioValue = 30000;
    const availableCash = 10000;
    const constraints: RebalanceConstraints = {
      rebalanceThreshold: 50, // Very high threshold
    };

    const trades = await comparePortfolios(
      mockCurrentPositions,
      mockTargetWeights,
      totalPortfolioValue,
      availableCash,
      constraints
    );

    expect(trades.length).toBe(0);
  });

  it('should respect minTradeValue constraint', async () => {
    const totalPortfolioValue = 30000;
    const availableCash = 10000;
    const constraints: RebalanceConstraints = {
      rebalanceThreshold: 5,
      minTradeValue: 50000, // Very high minimum
    };

    const trades = await comparePortfolios(
      mockCurrentPositions,
      mockTargetWeights,
      totalPortfolioValue,
      availableCash,
      constraints
    );

    // All trades should be filtered out due to minTradeValue
    expect(trades.every((trade) => trade.tradeValue >= 50000 || trade.tradeValue === 0)).toBe(
      true
    );
  });
});

