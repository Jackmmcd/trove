import FundList from '../components/FundList';
import Navigation from '../components/Navigation';
import TickerTape from '../components/TickerTape';

export default function FundsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <Navigation />
      <TickerTape />
      <FundList />
    </div>
  );
}
