import type { Metadata } from 'next';
import LandingShell from './components/LandingShell';

export const metadata: Metadata = {
  title: 'Trove — Institutional intelligence, accessible to every investor',
  description: 'Institutional intelligence, accessible to every investor.',
};

/**
 * One sentence, and nothing else.
 *
 * Everything the old copy asserted, the Analyst answers better when asked, so
 * the home page holds a single claim and the nav is the only other text.
 *
 * With nothing else on the page the typesetting is the design, and the first
 * attempt got it wrong in a specific way: an 18ch measure snapped a monospace
 * line into four ragged rows, and a hairline floating in dead space above them
 * read as a stray artefact. The measure is now set against the actual clause
 * lengths so the comma does the breaking, and the rule is anchored to the text
 * as a left-hand mark rather than centred above it.
 */
export default function LandingPage() {
  return (
    <LandingShell>
      <style>{`
        @keyframes trove-rise {
          from { opacity: 0; transform: translate3d(0, 10px, 0); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes trove-mark {
          from { opacity: 0; transform: scaleY(0.2); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes trove-caret {
          0%, 46%   { opacity: 1; }
          54%, 100% { opacity: 0; }
        }

        .trove-hero {
          /* The nav is a fixed 40px; the sentence owns everything below it. */
          min-height: calc(100vh - 40px);
          display: flex;
          align-items: center;
          padding: 56px clamp(24px, 7vw, 120px) 96px;
          background:
            radial-gradient(75% 55% at 24% 34%, rgba(255, 140, 0, 0.10), transparent 68%),
            radial-gradient(90% 70% at 88% 96%, rgba(255, 140, 0, 0.05), transparent 70%),
            #000;
        }

        /* Optical centring: sitting the block a touch above true centre reads
           as centred once the eye accounts for the nav bar above it. */
        .trove-block {
          position: relative;
          margin: 0 auto;
          transform: translateY(-3vh);
          padding-left: clamp(20px, 3.5vw, 44px);
          border-left: 1px solid rgba(255, 140, 0, 0.28);
          transform-origin: left top;
          animation: trove-mark 800ms cubic-bezier(.16,.84,.44,1) both;
        }

        .trove-line {
          margin: 0;
          /* Wide enough that "Institutional intelligence," holds one line at
             full size, so the comma breaks it rather than the container. */
          max-width: 26ch;
          font-family: 'Courier New', monospace;
          font-size: clamp(27px, 4.6vw, 58px);
          font-weight: 700;
          line-height: 1.22;
          letter-spacing: -0.015em;
          color: #efefef;
          text-wrap: balance;
          animation: trove-rise 1000ms cubic-bezier(.16,.84,.44,1) both;
          animation-delay: 140ms;
        }

        .trove-line em {
          font-style: normal;
          color: #ff8c00;
          /* Holds the amber off the pure-black ground at large sizes. */
          text-shadow: 0 0 38px rgba(255, 140, 0, 0.22);
        }

        .trove-caret {
          display: inline-block;
          width: 0.52ch;
          height: 0.86em;
          margin-left: 0.28ch;
          vertical-align: -0.08em;
          background: #ff8c00;
          animation: trove-caret 1.25s steps(1, end) infinite;
          animation-delay: 1.4s;
        }

        @media (max-width: 640px) {
          .trove-block { transform: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .trove-block, .trove-line, .trove-caret { animation: none; }
        }
      `}</style>

      <div className="trove-hero">
        <div className="trove-block">
          <h1 className="trove-line">
            Institutional intelligence, <em>accessible to every investor.</em>
            <span className="trove-caret" aria-hidden="true" />
          </h1>
        </div>
      </div>
    </LandingShell>
  );
}
