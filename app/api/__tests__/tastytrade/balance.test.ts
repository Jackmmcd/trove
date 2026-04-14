import { GET } from '../tastytrade/balance/route';
import { getTastytradeClient } from '@/lib/tastytrade/client';

jest.mock('@/lib/tastytrade/client', () => ({
  getTastytradeClient: jest.fn(),
}));

describe('/api/tastytrade/balance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns account balance successfully', async () => {
    const mockBalance = {
      netLiquidity: 100000,
      totalEquity: 105000,
      cashAvailableForTrading: 5000,
      buyingPower: 20000,
    };

    const mockClient = {
      getAccountBalance: jest.fn().mockResolvedValue(mockBalance),
    };

    (getTastytradeClient as jest.Mock).mockReturnValue(mockClient);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(mockBalance);
  });

  it('handles errors gracefully', async () => {
    const errorMessage = 'Failed to fetch balance';
    const mockClient = {
      getAccountBalance: jest.fn().mockRejectedValue(new Error(errorMessage)),
    };

    (getTastytradeClient as jest.Mock).mockReturnValue(mockClient);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe(errorMessage);
  });
});

