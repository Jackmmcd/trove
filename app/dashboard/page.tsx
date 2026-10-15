import Navigation from '../components/Navigation';
import TickerTape from '../components/TickerTape';
import Dashboard from '../components/Dashboard';

export default function DashboardPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-000000)' }}>
      <Navigation />
      <TickerTape />
      <Dashboard />
    </div>
  );
}
