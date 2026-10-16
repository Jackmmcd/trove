import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./theme.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";

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
  applicationName: "Trove",
  manifest: "/manifest.webmanifest",
  // What turns an iOS home-screen shortcut into a standalone app: no Safari
  // chrome, its own task-switcher card, its own name under the icon.
  appleWebApp: {
    capable: true,
    title: "Trove",
    // The status bar paints over the page, which is why every surface pads by
    // env(safe-area-inset-top). "default" keeps dark text, which is what the
    // light theme the app opens in needs.
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
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
  // Ask the browser to shrink the layout viewport for the keyboard rather
  // than leave it overlapping. Where it is honoured the composer needs no
  // help; useKeyboardInset covers the browsers that ignore it, iOS included.
  interactiveWidget: 'resizes-content',
  // Tracks the theme so the iOS status bar and the Android chrome match the
  // page instead of banding against it.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The boot script sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
