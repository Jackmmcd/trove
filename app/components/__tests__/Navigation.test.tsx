import { render, screen } from '@testing-library/react';
import Navigation from '../Navigation';
import { usePathname } from 'next/navigation';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  Link: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe('Navigation', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
  });

  it('renders the app title', () => {
    render(<Navigation />);
    expect(screen.getByText('13F Follower')).toBeInTheDocument();
  });

  it('renders all navigation links', () => {
    render(<Navigation />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Funds')).toBeInTheDocument();
    expect(screen.getByText('Rebalance')).toBeInTheDocument();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
  });

  it('highlights the active link', () => {
    (usePathname as jest.Mock).mockReturnValue('/funds');
    render(<Navigation />);
    
    const fundsLink = screen.getByText('Funds').closest('a');
    expect(fundsLink).toHaveClass('border-blue-500');
  });

  it('does not highlight inactive links', () => {
    (usePathname as jest.Mock).mockReturnValue('/');
    render(<Navigation />);
    
    const fundsLink = screen.getByText('Funds').closest('a');
    expect(fundsLink).toHaveClass('border-transparent');
  });
});

