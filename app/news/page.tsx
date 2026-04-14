import News from '../components/News';
import Navigation from '../components/Navigation';
import TickerTape from '../components/TickerTape';

export default function NewsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <Navigation />
      <TickerTape />
      <News />
    </div>
  );
}
