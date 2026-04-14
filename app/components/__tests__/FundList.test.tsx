import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FundList from '../FundList';

// Mock fetch globally
global.fetch = jest.fn();
global.alert = jest.fn();

describe('FundList', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    (global.alert as jest.Mock).mockClear();
  });

  it('shows loading state initially', () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<FundList />);
    expect(screen.getByText('Loading funds...')).toBeInTheDocument();
  });

  it('displays funds list', async () => {
    const mockFunds = {
      success: true,
      data: [
        {
          id: '1',
          cik: '0001067983',
          name: 'Berkshire Hathaway',
          enabled: true,
          holdings: [
            {
              ticker: 'AAPL',
              shares: 1000000,
              value: 150000000,
              weight: 45.5,
            },
          ],
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockFunds,
    });

    render(<FundList />);

    await waitFor(() => {
      expect(screen.getByText('Berkshire Hathaway')).toBeInTheDocument();
      expect(screen.getByText('CIK: 0001067983')).toBeInTheDocument();
    });

    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('displays fund holdings', async () => {
    const mockFunds = {
      success: true,
      data: [
        {
          id: '1',
          cik: '0001067983',
          name: 'Berkshire Hathaway',
          enabled: true,
          holdings: [
            {
              ticker: 'AAPL',
              shares: 1000000,
              value: 150000000,
              weight: 45.5,
            },
            {
              ticker: 'MSFT',
              shares: 500000,
              value: 150000000,
              weight: 45.5,
            },
          ],
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockFunds,
    });

    render(<FundList />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });
  });

  it('shows empty state when no funds are configured', async () => {
    const mockFunds = {
      success: true,
      data: [],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockFunds,
    });

    render(<FundList />);

    await waitFor(() => {
      expect(screen.getByText(/No funds configured/)).toBeInTheDocument();
    });
  });

  it('syncs funds when sync button is clicked', async () => {
    const user = userEvent.setup();
    
    const mockFunds = {
      success: true,
      data: [
        {
          id: '1',
          cik: '0001067983',
          name: 'Berkshire Hathaway',
          enabled: true,
          holdings: [],
        },
      ],
    };

    const mockSyncResponse = {
      success: true,
      data: { synced: 1 },
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockFunds,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockSyncResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockFunds,
      });

    render(<FundList />);

    await waitFor(() => {
      expect(screen.getByText('Sync Funds')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Funds');
    await user.click(syncButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/funds', { method: 'PUT' });
    });
  });

  it('disables sync button while syncing', async () => {
    const user = userEvent.setup();
    
    const mockFunds = {
      success: true,
      data: [],
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockFunds,
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({ success: true }),
        }), 100);
      }));

    render(<FundList />);

    await waitFor(() => {
      expect(screen.getByText('Sync Funds')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Funds');
    await user.click(syncButton);

    expect(screen.getByText('Syncing...')).toBeInTheDocument();
    expect(syncButton).toBeDisabled();
  });
});

