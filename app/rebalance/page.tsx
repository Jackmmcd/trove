import RebalanceView from '../components/RebalanceView';
import Navigation from '../components/Navigation';
import TickerTape from '../components/TickerTape';

export default function RebalancePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <Navigation />
      <TickerTape />
      <RebalanceView />
    </div>
  );
}
