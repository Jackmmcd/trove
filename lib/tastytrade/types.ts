export interface TastytradeAccount {
  accountNumber: string;
  externalId: string;
  openedAt: string;
  nickname: string;
  accountTypeName: string;
  dayTradingBuyingPower: number;
  optionBuyingPower: number;
  stockBuyingPower: number;
  netLiquidity: number;
  longStockValue: number;
  shortStockValue: number;
  longOptionValue: number;
  shortOptionValue: number;
  longFutureValue: number;
  shortFutureValue: number;
  longFuturesOptionValue: number;
  shortFuturesOptionValue: number;
  totalEquity: number;
  marginEquity: number;
  availableFunds: number;
  buyingPower: number;
  cash: number;
  cashAvailableForTrading: number;
  cashAvailableForWithdrawal: number;
  unsettledFunds: number;
}

export interface TastytradePosition {
  symbol: string;
  instrumentType: string;
  underlyingSymbol: string;
  quantity: number;
  quantityDirection: string;
  closePrice: number;
  averageOpenPrice: number;
  averageYearlyMarketClosePrice: number;
  averageDailyMarketClosePrice: number;
  mark: number;
  markPrice: number;
  multiplier: number;
  positionCost: number;
  totalCost: number;
  unrealizedDayGain: number;
  unrealizedDayGainEffect: number;
  unrealizedIntradayGain: number;
  unrealizedIntradayGainEffect: number;
  realizedDayGain: number;
  realizedDayGainEffect: number;
  realizedIntradayGain: number;
  realizedIntradayGainEffect: number;
  dayTradeReturn: number;
  dayTradeReturnEffect: number;
}

export interface TastytradeApiError {
  error: {
    code: string;
    message: string;
  };
}



