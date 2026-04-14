import { prisma } from '@/lib/prisma';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import {
  TargetWeight,
  CurrentPosition,
  RebalanceTrade,
  RebalanceResult,
  RebalanceConstraints,
} from './types';

/**
 * Calculate target portfolio weights from followed funds
 */
export async function calculateTargetWeights(): Promise<TargetWeight[]> {
  // Get all enabled funds
  const funds = await prisma.fund.findMany({
    where: { enabled: true },
    include: {
      holdings: {
        where: {
          // Get most recent quarter's holdings
          quarter: await getLatestQuarter(),
        },
      },
    },
  });

  // Aggregate holdings across all funds
  const tickerMap = new Map<string, { totalValue: number; fundCount: number }>();

  for (const fund of funds) {
    for (const holding of fund.holdings) {
      const existing = tickerMap.get(holding.ticker) || { totalValue: 0, fundCount: 0 };
      tickerMap.set(holding.ticker, {
        totalValue: existing.totalValue + holding.value,
        fundCount: existing.fundCount + 1,
      });
    }
  }

  // Calculate total value across all funds
  const totalValue = Array.from(tickerMap.values()).reduce(
    (sum, item) => sum + item.totalValue,
    0
  );

  // Convert to target weights (equal weighting of all funds)
  const targetWeights: TargetWeight[] = Array.from(tickerMap.entries()).map(
    ([ticker, data]) => ({
      ticker,
      weight: (data.totalValue / totalValue) * 100,
      targetValue: 0, // Will be calculated based on portfolio value
    })
  );

  return targetWeights.sort((a, b) => b.weight - a.weight);
}

/**
 * Get current portfolio positions from Tastytrade
 */
export async function getCurrentPositions(
  totalPortfolioValue: number
): Promise<CurrentPosition[]> {
  const client = getTastytradeClient();
  const positions = await client.getPositions();

  // Filter to only stock positions (exclude options, futures, etc.)
  const stockPositions = positions.filter(
    (p) => p.instrumentType === 'Equity' || p.instrumentType === 'Stock'
  );

  const currentPositions: CurrentPosition[] = stockPositions.map((pos) => {
    const currentValue = pos.markPrice * pos.quantity;
    return {
      ticker: pos.symbol,
      shares: pos.quantity,
      currentPrice: pos.markPrice,
      currentValue,
      currentWeight: totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0,
    };
  });

  return currentPositions;
}

/**
 * Compare current portfolio with target and generate rebalancing trades
 */
export async function comparePortfolios(
  currentPositions: CurrentPosition[],
  targetWeights: TargetWeight[],
  totalPortfolioValue: number,
  availableCash: number,
  constraints: RebalanceConstraints = {}
): Promise<RebalanceTrade[]> {
  const trades: RebalanceTrade[] = [];
  const threshold = constraints.rebalanceThreshold || 5; // Default 5% threshold

  // Update target values based on total portfolio value
  const targetWeightsWithValues = targetWeights.map((tw) => ({
    ...tw,
    targetValue: (tw.weight / 100) * totalPortfolioValue,
  }));

  // Create a map of current positions
  const currentMap = new Map<string, CurrentPosition>();
  currentPositions.forEach((pos) => {
    currentMap.set(pos.ticker, pos);
  });

  // Process target positions
  for (const target of targetWeightsWithValues) {
    const current = currentMap.get(target.ticker);
    const currentValue = current?.currentValue || 0;
    const deviation = ((currentValue - target.targetValue) / target.targetValue) * 100;

    // Only create trade if deviation exceeds threshold
    if (Math.abs(deviation) > threshold) {
      const targetShares = target.targetValue / (current?.currentPrice || target.targetValue);
      const currentShares = current?.shares || 0;
      const sharesDiff = targetShares - currentShares;
      const tradeValue = Math.abs(sharesDiff * (current?.currentPrice || 0));

      // Apply minimum trade value constraint
      if (constraints.minTradeValue && tradeValue < constraints.minTradeValue) {
        continue;
      }

      trades.push({
        ticker: target.ticker,
        action: sharesDiff > 0 ? 'buy' : 'sell',
        shares: Math.abs(sharesDiff),
        currentShares,
        targetShares,
        currentValue,
        targetValue: target.targetValue,
        tradeValue,
        deviation,
      });
    }
  }

  // Check for positions to sell (in current but not in target)
  for (const current of currentPositions) {
    const target = targetWeightsWithValues.find((tw) => tw.ticker === current.ticker);
    if (!target && current.currentValue > 0) {
      // Consider selling if position is significant
      if (current.currentWeight > 1) {
        trades.push({
          ticker: current.ticker,
          action: 'sell',
          shares: current.shares,
          currentShares: current.shares,
          targetShares: 0,
          currentValue: current.currentValue,
          targetValue: 0,
          tradeValue: current.currentValue,
          deviation: 100, // 100% deviation (entire position)
        });
      }
    }
  }

  return trades.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
}

/**
 * Generate complete rebalancing recommendations
 */
export async function generateRebalanceTrades(
  constraints: RebalanceConstraints = {}
): Promise<RebalanceResult> {
  // Get account balance
  const client = getTastytradeClient();
  const account = await client.getAccountBalance();
  const totalPortfolioValue = account.totalEquity || account.netLiquidity || 0;
  const availableCash = account.cashAvailableForTrading || account.availableFunds || 0;

  // Get current positions
  const currentPositions = await getCurrentPositions(totalPortfolioValue);

  // Calculate target weights
  const targetWeights = await calculateTargetWeights();

  // Generate trades
  const trades = await comparePortfolios(
    currentPositions,
    targetWeights,
    totalPortfolioValue,
    availableCash,
    constraints
  );

  // Calculate total trade value
  const totalTradeValue = trades.reduce((sum, trade) => sum + trade.tradeValue, 0);

  return {
    currentPositions,
    targetWeights: targetWeights.map((tw) => ({
      ...tw,
      targetValue: (tw.weight / 100) * totalPortfolioValue,
    })),
    trades,
    totalPortfolioValue,
    availableCash,
    totalTradeValue,
  };
}

/**
 * Get the latest quarter from holdings
 */
async function getLatestQuarter(): Promise<string> {
  const latestHolding = await prisma.holding.findFirst({
    orderBy: { quarter: 'desc' },
    select: { quarter: true },
  });

  return latestHolding?.quarter || getCurrentQuarter();
}

/**
 * Get current quarter string
 */
function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 1 && month <= 3) return `${year}-Q1`;
  if (month >= 4 && month <= 6) return `${year}-Q2`;
  if (month >= 7 && month <= 9) return `${year}-Q3`;
  return `${year}-Q4`;
}

