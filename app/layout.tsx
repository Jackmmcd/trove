import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trove — Trade Like the Smart Money",
  description: "Follow 13F institutional filings. Build baskets. Track performance.",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // Room to pinch-zoom a dense table without the browser zooming on its own.
  maximumScale: 5,
  userScalable: true,
  // Lets the page paint into the notch / home-indicator area; the safe-area
  // insets in globals.css keep content out of it.
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
