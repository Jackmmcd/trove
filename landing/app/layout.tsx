import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trove — Trade Like the Smart Money",
  description:
    "Follow 13F institutional filings. Build baskets. Track performance. Connected directly to your brokerage.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
