import type { Metadata } from 'next';
import LandingShell from './components/LandingShell';

export const metadata: Metadata = {
  title: 'Trove — Institutional intelligence, accessible to every investor',
  description: 'Institutional intelligence, accessible to every investor.',
};

/**
 * One sentence, and nothing else.
 *
 * The page carried the whole pitch — stats, fund tables, feature grid — and the
 * Analyst tab is where any of that is actually demonstrated. Everything the
 * copy used to assert, the product answers better when asked. So the overview
 * holds a single claim and gets out of the way; the nav is the only other text.
 *
 * What is left has to carry the room on type and space alone: one measure, one
 * rule, one accent, a slow settle on entry. No second element to hide behind.
 */
export default function LandingPage() {
  return (
    <LandingShell>
      <style>{`
        @keyframes trove-rise {
          from { opacity: 0; transform: translate3d(0, 14px, 0); }
          to   { opacity: 1; transform: none; }
        }
        .trove-hero {
          /* The nav is a fixed 40px; the sentence owns everything below it. */
          min-height: calc(100vh - 40px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 40px;
          padding: 48px 24px 88px;
          background:
            radial-gradient(120% 90% at 50% -10%, rgba(255, 140, 0, 0.09), transparent 62%),
            #000;
          text-align: center;
        }
        .trove-rule {
          width: 56px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #ff8c00, transparent);
          animation: trove-rise 900ms cubic-bezier(.16,.84,.44,1) both;
        }
        .trove-line {
          margin: 0;
          max-width: 18ch;
          font-family: 'Courier New', monospace;
          font-size: clamp(30px, 5.4vw, 62px);
          font-weight: 700;
          line-height: 1.28;
          letter-spacing: 0.02em;
          color: #ededed;
          text-wrap: balance;
          animation: trove-rise 1100ms cubic-bezier(.16,.84,.44,1) both;
          animation-delay: 120ms;
        }
        .trove-line em {
          font-style: normal;
          color: #ff8c00;
        }
        @media (prefers-reduced-motion: reduce) {
          .trove-rule, .trove-line { animation: none; }
        }
      `}</style>

      <div className="trove-hero">
        <div className="trove-rule" />
        <h1 className="trove-line">
          Institutional intelligence, <em>accessible to every investor.</em>
        </h1>
      </div>
    </LandingShell>
  );
}
