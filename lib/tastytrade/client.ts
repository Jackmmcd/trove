import axios, { AxiosInstance } from 'axios';
import { TastytradeAccount, TastytradePosition, TastytradeApiError } from './types';

export class TastytradeClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(accessToken?: string) {
    const clientId = process.env.TASTYTRADE_CLIENT_ID;
    const clientSecret = process.env.TASTYTRADE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('TASTYTRADE_CLIENT_ID and TASTYTRADE_CLIENT_SECRET must be set in environment variables');
    }

    this.client = axios.create({
      baseURL: 'https://api.tastytrade.com',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // If an access token is provided, use it.
    // Session tokens (from POST /sessions) are passed as-is; OAuth tokens need Bearer prefix.
    if (accessToken) {
      this.accessToken = accessToken;
      const isSessionToken = !accessToken.startsWith('ey') || accessToken.split('.').length !== 3;
      this.client.defaults.headers.common['Authorization'] = isSessionToken
        ? accessToken
        : `Bearer ${accessToken}`;
    }
  }

  /**
   * Generate OAuth2 authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const clientId = process.env.TASTYTRADE_CLIENT_ID!;
    const redirectUri = process.env.TASTYTRADE_REDIRECT_URI!;
    const scopes = process.env.TASTYTRADE_SCOPES || 'read trade openid';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      ...(state && { state }),
    });

    return `https://api.tastytrade.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }> {
    const clientId = process.env.TASTYTRADE_CLIENT_ID!;
    const clientSecret = process.env.TASTYTRADE_CLIENT_SECRET!;
    const redirectUri = process.env.TASTYTRADE_REDIRECT_URI!;

    try {
      const response = await axios.post('https://api.tastytrade.com/oauth/token', {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, refresh_token, expires_in, token_type } = response.data;

      this.accessToken = access_token;
      this.refreshToken = refresh_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);
      this.client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      return { access_token, refresh_token, expires_in, token_type };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`OAuth token exchange failed: ${error.response?.data?.error_description || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    const clientId = process.env.TASTYTRADE_CLIENT_ID!;
    const clientSecret = process.env.TASTYTRADE_CLIENT_SECRET!;

    try {
      const response = await axios.post('https://api.tastytrade.com/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, refresh_token: new_refresh_token, expires_in } = response.data;

      this.accessToken = access_token;
      this.refreshToken = new_refresh_token;
      this.tokenExpiry = Date.now() + (expires_in * 1000);
      this.client.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      return { access_token, refresh_token: new_refresh_token, expires_in };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if token is expired or about to expire (within 5 minutes)
   */
  isTokenExpired(): boolean {
    if (!this.tokenExpiry) return false; // If we don't know expiry, assume valid and let the API decide
    return Date.now() >= (this.tokenExpiry - 5 * 60 * 1000);
  }

  /**
   * Set the access token manually (e.g., from session storage)
   */
  setAccessToken(accessToken: string, refreshToken?: string, expiresIn?: number): void {
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
    if (expiresIn) this.tokenExpiry = Date.now() + (expiresIn * 1000);
    this.client.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  }

  /**
   * Ensure we have a valid access token
   */
  private ensureAuthenticated(): void {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Please call setAccessToken() or complete OAuth flow first.');
    }
    if (this.isTokenExpired()) {
      throw new Error('Access token expired. Please refresh the token.');
    }
  }

  /**
   * Get the first account number for the authenticated user
   */
  async getAccountNumber(): Promise<string> {
    this.ensureAuthenticated();

    try {
      const response = await this.client.get('/customers/me/accounts');
      const accounts = response.data.data?.items || response.data.data || response.data;
      const first = Array.isArray(accounts) ? accounts[0] : accounts;
      const accountNumber = first?.account?.['account-number'] || first?.['account-number'] || first?.accountNumber;

      if (!accountNumber) {
        throw new Error('No account number found in response');
      }

      return accountNumber;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) throw new Error('Unauthorized. Please re-authenticate.');
        throw new Error(`Tastytrade API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get account balance and summary
   */
  async getAccountBalance(accountNumber?: string): Promise<Pick<TastytradeAccount, 'netLiquidity' | 'totalEquity' | 'cashAvailableForTrading' | 'buyingPower' | 'availableFunds'>> {
    this.ensureAuthenticated();

    try {
      const acctNum = accountNumber || await this.getAccountNumber();
      const response = await this.client.get(`/accounts/${acctNum}/balances`);
      const raw = response.data.data || response.data;

      // Map Tastytrade's kebab-case fields to our camelCase interface
      return {
        netLiquidity: parseFloat(raw['net-liquidating-value'] || '0'),
        totalEquity: parseFloat(raw['margin-equity'] || '0'),
        cashAvailableForTrading: parseFloat(raw['cash-balance'] || '0'),
        buyingPower: parseFloat(raw['equity-buying-power'] || '0'),
        availableFunds: parseFloat(raw['available-trading-funds'] || raw['equity-buying-power'] || '0'),
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) throw new Error('Unauthorized. Please re-authenticate.');
        throw new Error(`Tastytrade API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get current positions
   */
  async getPositions(accountNumber?: string): Promise<TastytradePosition[]> {
    this.ensureAuthenticated();

    try {
      const acctNum = accountNumber || await this.getAccountNumber();
      const response = await this.client.get(`/accounts/${acctNum}/positions`);
      const data = response.data.data?.items || response.data.data || response.data;
      return Array.isArray(data) ? data : [data];
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) throw new Error('Unauthorized. Please re-authenticate.');
        throw new Error(`Tastytrade API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get market quotes for a list of symbols
   */
  async getQuotes(symbols: string[]): Promise<Record<string, number>> {
    this.ensureAuthenticated();
    try {
      const params = symbols.map(s => `symbols[]=${encodeURIComponent(s)}`).join('&');
      const response = await this.client.get(`/market-data/quotes?${params}`);
      const items: any[] = response.data?.data?.items ?? [];
      const result: Record<string, number> = {};
      for (const item of items) {
        const price =
          parseFloat(item['last'] || item['mid-point'] || item['bid'] || '0');
        if (item.symbol && price > 0) result[item.symbol] = price;
      }
      return result;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Tastytrade API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get ACH relationships (linked bank accounts)
   */
  async getAchRelationships(accountNumber?: string): Promise<any[]> {
    this.ensureAuthenticated();
    const acctNum = accountNumber || await this.getAccountNumber();
    const res = await this.client.get(`/accounts/${acctNum}/ach-relationships`);
    return res.data?.data?.items ?? res.data?.data ?? [];
  }

  /**
   * Create an ACH transfer (deposit or withdrawal)
   */
  async createTransfer(accountNumber: string | undefined, transfer: { achRelationshipId: string; amount: string; direction: 'Deposit' | 'Withdrawal' }): Promise<any> {
    this.ensureAuthenticated();
    const acctNum = accountNumber || await this.getAccountNumber();
    const res = await this.client.post(`/accounts/${acctNum}/transfers`, {
      'ach-relationship-id': transfer.achRelationshipId,
      amount: transfer.amount,
      direction: transfer.direction,
    });
    return res.data?.data ?? res.data;
  }

  /**
   * List ACH transfers for the account
   */
  async getTransfers(accountNumber?: string): Promise<any[]> {
    this.ensureAuthenticated();
    const acctNum = accountNumber || await this.getAccountNumber();
    const res = await this.client.get(`/accounts/${acctNum}/transfers`);
    return res.data?.data?.items ?? res.data?.data ?? [];
  }

  /**
   * Place a market order
   */
  async placeOrder(accountNumber: string | undefined, order: { symbol: string; quantity: number; action: 'buy' | 'sell' }): Promise<any> {
    this.ensureAuthenticated();

    try {
      const acctNum = accountNumber || await this.getAccountNumber();
      const body = {
        'time-in-force': 'Day',
        'order-type': 'Market',
        legs: [
          {
            'instrument-type': 'Equity',
            symbol: order.symbol,
            quantity: order.quantity,
            action: order.action === 'buy' ? 'Buy to Open' : 'Sell to Close',
          },
        ],
      };
      const response = await this.client.post(`/accounts/${acctNum}/orders`, body);

      // Tastytrade returns preflight errors in the response body even on 2xx
      const preflight = response.data?.data?.['preflight-check-results'];
      if (Array.isArray(preflight) && preflight.length > 0) {
        const failed = preflight.filter((p: any) => p.status !== 'Passed');
        if (failed.length > 0) {
          const msg = failed.map((p: any) => p['reason-description'] || p.reason || p.status).join('; ');
          throw new Error(`Preflight failed: ${msg}`);
        }
      }

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        // Extract preflight errors from error response
        const errors = error.response?.data?.error?.errors;
        if (Array.isArray(errors) && errors.length > 0) {
          const msg = errors.map((e: any) => e.message || e.code).join('; ');
          throw new Error(`Tastytrade API error: ${msg}`);
        }
        throw new Error(`Tastytrade API error: ${error.response?.data?.error?.message || JSON.stringify(error.response?.data) || error.message}`);
      }
      throw error;
    }
  }
}

/**
 * Create a new Tastytrade client instance with optional access token
 * For OAuth flow, you should provide the access token from the session
 */
export function getTastytradeClient(accessToken?: string): TastytradeClient {
  return new TastytradeClient(accessToken);
}



