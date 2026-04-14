import Dashboard from './components/Dashboard';
import Navigation from './components/Navigation';
import TickerTape from './components/TickerTape';

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <Navigation />
      <TickerTape />
      <Dashboard />
    </div>
  );
}
