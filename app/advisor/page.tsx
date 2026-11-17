import { Suspense } from 'react';
import Navigation from '../components/Navigation';
import AnalystChat from '@/app/components/AnalystChat';

export const metadata = { title: 'Analyst · Trove' };

export default function AdvisorPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-000000)' }}>
      <Navigation />
      {/* AnalystChat reads ?q=, which needs a Suspense boundary to render statically. */}
      <Suspense>
        <AnalystChat />
      </Suspense>
    </div>
  );
}
