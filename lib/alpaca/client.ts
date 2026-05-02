import axios, { AxiosInstance } from 'axios';

export class AlpacaClient {
  private client: AxiosInstance;
  private dataClient: AxiosInstance;

  constructor() {
    const apiKey = process.env.ALPACA_API_KEY;
    const apiSecret = process.env.ALPACA_API_SECRET;
    const baseUrl = (process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets/v2').replace(/\/$/, '');

    if (!apiKey || !apiSecret) {
      throw new Error('ALPACA_API_KEY and ALPACA_API_SECRET must be set in environment variables');
    }

    const headers = {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
      'Content-Type': 'application/json',
    };

    this.client = axios.create({ baseURL: baseUrl, headers });
    this.dataClient = axios.create({ baseURL: 'https://data.alpaca.markets/v2', headers });
  }

  async getAccountBalance(): Promise<{ netLiquidity: number; totalEquity: number; cashAvailableForTrading: number; buyingPower: number }> {
    const res = await this.client.get('/account');
    const a = res.data;
    return {
      netLiquidity: parseFloat(a.portfolio_value ?? a.equity ?? '0'),
      totalEquity: parseFloat(a.equity ?? '0'),
      cashAvailableForTrading: parseFloat(a.cash ?? '0'),
      buyingPower: parseFloat(a.buying_power ?? '0'),
    };
  }

  // Returns positions shaped like Tastytrade's so the Dashboard can parse them without changes.
  async getPositions(): Promise<any[]> {
    const res = await this.client.get('/positions');
    return (res.data as any[]).map(p => ({
      symbol: p.symbol,
      'instrument-type': 'Equity',
      quantity: parseFloat(p.qty ?? '0'),
      'close-price': p.current_price ?? '0',
      'mark-price': p.current_price ?? '0',
      'average-open-price': p.avg_entry_price ?? '0',
    }));
  }

  async getQuotes(symbols: string[]): Promise<Record<string, number>> {
    if (symbols.length === 0) return {};
    const prices: Record<string, number> = {};

    // Batch in chunks of 100 (well within Alpaca's limit)
    for (let i = 0; i < symbols.length; i += 100) {
      const chunk = symbols.slice(i, i + 100);
      const res = await this.dataClient.get('/stocks/snapshots', {
        params: { symbols: chunk.join(',') },
      });
      for (const [symbol, data] of Object.entries(res.data as Record<string, any>)) {
        const price: number =
          data?.latestTrade?.p ??
          data?.latestQuote?.ap ??
          data?.dailyBar?.c ??
          0;
        if (price > 0) prices[symbol] = price;
      }
    }

    return prices;
  }

  // Alpaca supports fractional qty — pass quantity as a float (e.g. 1.5 shares).
  async placeOrder(order: { symbol: string; quantity: number; action: 'buy' | 'sell' }): Promise<any> {
    const res = await this.client.post('/orders', {
      symbol: order.symbol,
      qty: String(order.quantity),
      side: order.action,
      type: 'market',
      time_in_force: 'day',
    });
    return res.data;
  }
}
