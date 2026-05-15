import { GET, POST, PUT } from '../funds/route';
import { syncAllFunds } from '@/lib/services/fund-sync';
import { NextRequest } from 'next/server';

const mockFrom = jest.fn();
jest.mock('@/lib/supabase/admin', () => ({
  db: { from: (...args: any[]) => mockFrom(...args) },
}));

jest.mock('@/lib/services/fund-sync');

describe('/api/funds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('returns list of funds', async () => {
      const mockFunds = [{ id: '1', cik: '0001067983', name: 'Berkshire Hathaway', enabled: true }];
      mockFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ data: mockFunds, error: null }) });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('handles errors', async () => {
      mockFrom.mockReturnValue({ select: jest.fn().mockReturnValue({ data: null, error: new Error('Database error') }) });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('PUT', () => {
    it('syncs all funds', async () => {
      const mockResults = { synced: 1, errors: [] };
      (syncAllFunds as jest.Mock).mockResolvedValue(mockResults);

      const response = await PUT();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockResults);
    });

    it('handles sync errors', async () => {
      (syncAllFunds as jest.Mock).mockRejectedValue(new Error('Sync failed'));

      const response = await PUT();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
