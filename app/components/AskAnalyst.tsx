import Link from 'next/link';

/**
 * Hands the page's subject to the Analyst as a ready-made question, so asking
 * about a fund or company never starts with retyping what you were looking at.
 * The Analyst asks anything that arrives as ?q= straight away.
 */
export default function AskAnalyst({ question, label = 'ASK ANALYST' }: { question: string; label?: string }) {
  return (
    <Link
      href={`/advisor?q=${encodeURIComponent(question)}`}
      title={question}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
        border: '1px solid var(--bg-ff8c00)', color: 'var(--fg-ff8c00)', textDecoration: 'none',
        fontFamily: 'Courier New, monospace', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1.5px',
        padding: '6px 14px',
      }}
    >
      ✦ {label}
    </Link>
  );
}
