import type { MetadataRoute } from 'next';

/**
 * The web app manifest — what iOS reads when you Add to Home Screen, and what
 * turns the site into a standalone app rather than a Safari tab.
 *
 * `display: standalone` is the line that removes the browser chrome. The
 * colours are the LIGHT palette from theme.css on purpose: the installed app
 * opens light (see THEME_BOOT_SCRIPT), so a dark splash would flash the wrong
 * colour on every cold launch.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trove — 13F Tracker',
    short_name: 'Trove',
    description:
      'Follow 13F institutional filings. Build baskets. Track performance.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches --bg-000000 under [data-theme='light'] so the launch screen and
    // the first painted frame are the same white.
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A maskable copy keeps the mark inside the safe zone when a launcher
      // crops it to a circle or squircle.
      { src: '/icons/512?maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
