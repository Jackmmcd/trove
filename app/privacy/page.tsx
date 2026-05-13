import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Trove',
};

const S = {
  amber: '#ff8c00', border: '#2a2a2a', label: '#888', text: '#ccc', dim: '#666',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '36px' }}>
      <h2 style={{ color: S.amber, fontSize: '11px', letterSpacing: '3px', fontWeight: 'bold', marginBottom: '12px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ color: S.text, fontSize: '13px', lineHeight: 1.9, marginBottom: '12px' }}>{children}</p>;
}

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: 'Courier New, monospace', color: S.text }}>
      <nav style={{ borderBottom: `1px solid ${S.amber}`, background: '#000', padding: '0 24px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ background: S.amber, color: '#000', fontWeight: 900, fontSize: '15px', letterSpacing: '3px', padding: '0 14px', height: '44px', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>TROVE</a>
        <span style={{ color: S.label, fontSize: '10px', letterSpacing: '2px' }}>PRIVACY POLICY</span>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '64px 24px' }}>
        <h1 style={{ color: S.amber, fontSize: '20px', letterSpacing: '4px', fontWeight: 900, marginBottom: '8px' }}>PRIVACY POLICY</h1>
        <p style={{ color: S.dim, fontSize: '10px', letterSpacing: '2px', marginBottom: '48px' }}>LAST UPDATED: MAY 2026</p>

        <Section title="1. INFORMATION WE COLLECT">
          <P>Trove collects the minimum information necessary to provide the Service:</P>
          <P><strong style={{ color: S.amber }}>Authentication credentials:</strong> A hashed password and optional TOTP secret for app login. We never collect or store your brokerage username or password.</P>
          <P><strong style={{ color: S.amber }}>Brokerage OAuth tokens:</strong> When you connect a brokerage account, we store the OAuth access and refresh tokens provided by that broker. These tokens grant read/write access to your brokerage account as you authorize. They are encrypted at rest and never shared with third parties.</P>
          <P><strong style={{ color: S.amber }}>Portfolio data:</strong> Account balances, positions, and trade history are fetched from your broker in real time and displayed in the app. We may cache recent position data briefly for performance.</P>
          <P><strong style={{ color: S.amber }}>Watchlist and fund preferences:</strong> Which institutional funds you have added to your tracking list.</P>
        </Section>

        <Section title="2. HOW WE USE YOUR INFORMATION">
          <P>We use collected information solely to provide and improve the Service: displaying your portfolio, executing orders at your direction, generating AI analysis of your holdings, and delivering news relevant to your positions.</P>
          <P>We do not sell, rent, or share your personal data or portfolio data with any third party for marketing purposes.</P>
        </Section>

        <Section title="3. THIRD-PARTY SERVICES">
          <P>Trove uses the following third-party APIs to deliver the Service:</P>
          <P><strong style={{ color: S.amber }}>Brokerage APIs (Tastytrade, Charles Schwab, Alpaca):</strong> Your OAuth token is sent to your broker's API servers to fetch data and place orders. This is governed by your brokerage's privacy policy.</P>
          <P><strong style={{ color: S.amber }}>Polygon.io:</strong> We send stock ticker symbols to Polygon.io to retrieve market data and news. No personally identifiable information is transmitted.</P>
          <P><strong style={{ color: S.amber }}>Anthropic (Claude AI):</strong> When AI analysis is requested, we send ticker symbols and publicly available financial data to Anthropic's API. No account numbers, names, or personal data are included in these requests.</P>
          <P><strong style={{ color: S.amber }}>SEC EDGAR:</strong> All 13F filing data is retrieved directly from the SEC's public EDGAR system. No personal data is transmitted.</P>
        </Section>

        <Section title="4. DATA SECURITY">
          <P>OAuth tokens are stored encrypted in our database. App login uses industry-standard password hashing and optional TOTP two-factor authentication. We do not store brokerage credentials (username/password) at any time.</P>
          <P>You can revoke Trove's access to your brokerage account at any time by revoking the OAuth authorization in your broker's account settings.</P>
        </Section>

        <Section title="5. DATA RETENTION">
          <P>We retain account data for as long as your account is active. You may request deletion of your account and associated data by contacting us. OAuth tokens are invalidated upon account deletion.</P>
        </Section>

        <Section title="6. YOUR RIGHTS">
          <P>You have the right to access, correct, or delete personal data we hold about you. To exercise these rights, contact us at the address below.</P>
        </Section>

        <Section title="7. CHANGES TO THIS POLICY">
          <P>We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last Updated" date above. Continued use of the Service constitutes acceptance of the updated policy.</P>
        </Section>

        <Section title="8. CONTACT">
          <P>For privacy-related questions or requests, please use the contact information provided in the app or on the Trove website.</P>
        </Section>
      </div>

      <footer style={{ borderTop: `1px solid ${S.border}`, padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#333', fontSize: '9px', letterSpacing: '2px' }}>
          © 2026 TROVE &nbsp;·&nbsp;
          <a href="/terms" style={{ color: '#444', textDecoration: 'underline' }}>TERMS</a> &nbsp;·&nbsp;
          <a href="/privacy" style={{ color: '#444', textDecoration: 'underline' }}>PRIVACY</a> &nbsp;·&nbsp;
          <a href="/disclosures" style={{ color: '#444', textDecoration: 'underline' }}>RISK DISCLOSURES</a>
        </div>
      </footer>
    </div>
  );
}
