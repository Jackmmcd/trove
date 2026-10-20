import { db } from '@/lib/supabase/admin';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { isOnDemand } from '@/lib/funds/directory';
import {
  TargetWeight,
  CurrentPosition,
  RebalanceTrade,
  RebalanceResult,
  RebalanceConstraints,
} from './types';

async function getLatestQuarter(): Promise<string> {
  const { data } = await db.from('holdings').select('quarter').order('quarter', { ascending: false }).limit(1).maybeSingle();
  return data?.quarter || getCurrentQuarter();
}

function getCurrentQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month <= 3) return `${year}-Q1`;
  if (month <= 6) return `${year}-Q2`;
  if (month <= 9) return `${year}-Q3`;
  return `${year}-Q4`;
}

export async function calculateTargetWeights(): Promise<TargetWeight[]> {
  const quarter = await getLatestQuarter();
  // Weights are dollar-summed across funds, so one opened BlackRock page would
  // otherwise turn the target into the market index. On-demand funds are for
  // looking at, not for following.
  const { data: all } = await db.from('funds').select('id, cik').eq('enabled', true);
  const funds = (all ?? []).filter(f => !isOnDemand(f.cik));
  if (!funds.length) return [];

  const { data: holdings } = await db.from('holdings').select('ticker, value, fund_id').in('fund_id', funds.map(f => f.id)).eq('quarter', quarter)
    // Options are not ownership: a put is a bet against the stock, and a call's
    // reported value is the underlying it controls, not capital committed.
    .is('put_call', null);

  const tickerMap = new Map<string, { totalValue: number }>();
  for (const h of (holdings ?? [])) {
    const existing = tickerMap.get(h.ticker) || { totalValue: 0 };
    tickerMap.set(h.ticker, { totalValue: existing.totalValue + h.value });
  }

  const totalValue = Array.from(tickerMap.values()).reduce((sum, item) => sum + item.totalValue, 0);
  return Array.from(tickerMap.entries())
    .map(([ticker, data]) => ({ ticker, weight: (data.totalValue / totalValue) * 100, targetValue: 0 }))
    .sort((a, b) => b.weight - a.weight);
}

export async function getCurrentPositions(totalPortfolioValue: number): Promise<CurrentPosition[]> {
  const client = getTastytradeClient();
  const positions = await client.getPositions();
  return positions
    .filter((p: any) => p.instrumentType === 'Equity' || p.instrumentType === 'Stock')
    .map((pos: any) => {
      const currentValue = pos.markPrice * pos.quantity;
      return {
        ticker: pos.symbol,
        shares: pos.quantity,
        currentPrice: pos.markPrice,
        currentValue,
        currentWeight: totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0,
      };
    });
}

export async function comparePortfolios(
  currentPositions: CurrentPosition[],
  targetWeights: TargetWeight[],
  totalPortfolioValue: number,
  availableCash: number,
  constraints: RebalanceConstraints = {}
): Promise<RebalanceTrade[]> {
  const trades: RebalanceTrade[] = [];
  const threshold = constraints.rebalanceThreshold || 5;
  const targetWeightsWithValues = targetWeights.map(tw => ({ ...tw, targetValue: (tw.weight / 100) * totalPortfolioValue }));
  const currentMap = new Map<string, CurrentPosition>();
  currentPositions.forEach(pos => currentMap.set(pos.ticker, pos));

  for (const target of targetWeightsWithValues) {
    const current = currentMap.get(target.ticker);
    const currentValue = current?.currentValue || 0;
    const deviation = ((currentValue - target.targetValue) / target.targetValue) * 100;
    if (Math.abs(deviation) > threshold) {
      const targetShares = target.targetValue / (current?.currentPrice || target.targetValue);
      const currentShares = current?.shares || 0;
      const sharesDiff = targetShares - currentShares;
      const tradeValue = Math.abs(sharesDiff * (current?.currentPrice || 0));
      if (constraints.minTradeValue && tradeValue < constraints.minTradeValue) continue;
      trades.push({ ticker: target.ticker, action: sharesDiff > 0 ? 'buy' : 'sell', shares: Math.abs(sharesDiff), currentShares, targetShares, currentValue, targetValue: target.targetValue, tradeValue, deviation });
    }
  }

  for (const current of currentPositions) {
    if (!targetWeightsWithValues.find(tw => tw.ticker === current.ticker) && current.currentValue > 0 && current.currentWeight > 1) {
      trades.push({ ticker: current.ticker, action: 'sell', shares: current.shares, currentShares: current.shares, targetShares: 0, currentValue: current.currentValue, targetValue: 0, tradeValue: current.currentValue, deviation: 100 });
    }
  }

  return trades.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
}

export async function generateRebalanceTrades(constraints: RebalanceConstraints = {}): Promise<RebalanceResult> {
  const client = getTastytradeClient();
  const account = await client.getAccountBalance();
  const totalPortfolioValue = account.totalEquity || account.netLiquidity || 0;
  const availableCash = account.cashAvailableForTrading || account.availableFunds || 0;
  const currentPositions = await getCurrentPositions(totalPortfolioValue);
  const targetWeights = await calculateTargetWeights();
  const trades = await comparePortfolios(currentPositions, targetWeights, totalPortfolioValue, availableCash, constraints);
  const totalTradeValue = trades.reduce((sum, trade) => sum + trade.tradeValue, 0);
  return {
    currentPositions,
    targetWeights: targetWeights.map(tw => ({ ...tw, targetValue: (tw.weight / 100) * totalPortfolioValue })),
    trades,
    totalPortfolioValue,
    availableCash,
    totalTradeValue,
  };
}
