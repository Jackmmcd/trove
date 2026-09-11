import Navigation from '../components/Navigation';
import AnalystChat from '@/app/components/AnalystChat';

export const metadata = { title: 'Analyst · Trove' };

export default function AdvisorPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <Navigation />
      <AnalystChat />
    </div>
  );
}
