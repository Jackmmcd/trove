import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trove — Trade Like the Smart Money",
  description:
    "Follow 13F institutional filings. Build baskets. Track performance. Connected directly to your brokerage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: "#000" }}>
      <body style={{
        margin: 0, padding: 0,
        background: "#000",
        color: "#e0e0e0",
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: "13px",
      }}>
        {children}
      </body>
    </html>
  );
}
