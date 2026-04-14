import Recommendations from '../components/Recommendations';
import Navigation from '../components/Navigation';
import TickerTape from '../components/TickerTape';

export default function RecommendationsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <Navigation />
      <TickerTape />
      <Recommendations />
    </div>
  );
}
