import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../Dashboard';

// Mock fetch globally
global.fetch = jest.fn();

describe('Dashboard', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('shows loading state initially', () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<Dashboard />);
    expect(screen.getByText('Loading account data...')).toBeInTheDocument();
  });

  it('displays account balance data', async () => {
    const mockBalance = {
      success: true,
      data: {
        netLiquidity: 100000,
        totalEquity: 105000,
        cashAvailableForTrading: 5000,
        buyingPower: 20000,
      },
    };

    const mockPositions = {
      success: true,
      data: [
        {
          symbol: 'AAPL',
          quantity: 100,
          markPrice: 150,
          instrumentType: 'Equity',
        },
      ],
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalance,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPositions,
      });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Net Liquidity')).toBeInTheDocument();
      expect(screen.getByText('$100,000.00')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Equity')).toBeInTheDocument();
    expect(screen.getByText('Cash Available')).toBeInTheDocument();
    expect(screen.getByText('Buying Power')).toBeInTheDocument();
  });

  it('displays positions table', async () => {
    const mockBalance = {
      success: true,
      data: {
        netLiquidity: 100000,
        totalEquity: 105000,
        cashAvailableForTrading: 5000,
        buyingPower: 20000,
      },
    };

    const mockPositions = {
      success: true,
      data: [
        {
          symbol: 'AAPL',
          quantity: 100,
          markPrice: 150,
          instrumentType: 'Equity',
        },
        {
          symbol: 'MSFT',
          quantity: 50,
          markPrice: 300,
          instrumentType: 'Stock',
        },
      ],
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalance,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPositions,
      });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('MSFT')).toBeInTheDocument();
    });

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('shows error message and retry button on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('retries data fetch when retry button is clicked', async () => {
    const user = userEvent.setup();
    
    const mockBalance = {
      success: true,
      data: {
        netLiquidity: 100000,
        totalEquity: 105000,
        cashAvailableForTrading: 5000,
        buyingPower: 20000,
      },
    };

    const mockPositions = {
      success: true,
      data: [],
    };

    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalance,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPositions,
      });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Net Liquidity')).toBeInTheDocument();
    });
  });

  it('shows "No positions found" when there are no positions', async () => {
    const mockBalance = {
      success: true,
      data: {
        netLiquidity: 100000,
        totalEquity: 105000,
        cashAvailableForTrading: 5000,
        buyingPower: 20000,
      },
    };

    const mockPositions = {
      success: true,
      data: [],
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBalance,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPositions,
      });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('No positions found')).toBeInTheDocument();
    });
  });
});

