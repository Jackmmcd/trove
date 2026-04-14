import { GET, POST, PUT } from '../funds/route';
import { prisma } from '@/lib/prisma';
import { syncAllFunds } from '@/lib/services/fund-sync';
import { NextRequest } from 'next/server';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    fund: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/services/fund-sync');

describe('/api/funds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET', () => {
    it('returns list of funds', async () => {
      const mockFunds = [
        {
          id: '1',
          cik: '0001067983',
          name: 'Berkshire Hathaway',
          enabled: true,
          holdings: [],
        },
      ];

      (prisma.fund.findMany as jest.Mock).mockResolvedValue(mockFunds);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockFunds);
    });

    it('handles errors', async () => {
      (prisma.fund.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('POST', () => {
    it('creates a new fund', async () => {
      const mockFund = {
        id: '1',
        cik: '0001067983',
        name: 'Berkshire Hathaway',
        enabled: true,
      };

      (prisma.fund.create as jest.Mock).mockResolvedValue(mockFund);

      const request = new NextRequest('http://localhost:3000/api/funds', {
        method: 'POST',
        body: JSON.stringify({
          cik: '1067983',
          name: 'Berkshire Hathaway',
          enabled: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockFund);
      expect(prisma.fund.create).toHaveBeenCalledWith({
        data: {
          cik: '0001067983', // Should be zero-padded
          name: 'Berkshire Hathaway',
          enabled: true,
        },
      });
    });

    it('validates required fields', async () => {
      const request = new NextRequest('http://localhost:3000/api/funds', {
        method: 'POST',
        body: JSON.stringify({
          cik: '1067983',
          // Missing name
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('CIK and name are required');
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

