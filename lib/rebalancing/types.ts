export interface TargetWeight {
  ticker: string;
  weight: number; // Percentage (0-100)
  targetValue: number; // Dollar amount
}

export interface CurrentPosition {
  ticker: string;
  shares: number;
  currentPrice: number;
  currentValue: number;
  currentWeight: number; // Percentage of total portfolio
}

export interface RebalanceTrade {
  ticker: string;
  action: 'buy' | 'sell';
  shares: number;
  currentShares: number;
  targetShares: number;
  currentValue: number;
  targetValue: number;
  tradeValue: number; // Absolute value of trade
  deviation: number; // Percentage deviation from target
}

export interface RebalanceResult {
  currentPositions: CurrentPosition[];
  targetWeights: TargetWeight[];
  trades: RebalanceTrade[];
  totalPortfolioValue: number;
  availableCash: number;
  totalTradeValue: number;
}

export interface RebalanceConstraints {
  minTradeValue?: number; // Minimum dollar amount for a trade
  maxPositionWeight?: number; // Maximum weight for a single position
  rebalanceThreshold?: number; // Only rebalance if deviation > threshold %
  minLiquidity?: number; // Minimum daily volume requirement
}



