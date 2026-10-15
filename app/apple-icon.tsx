import { ImageResponse } from 'next/og';

/**
 * The iPhone home-screen icon. iOS ignores the manifest's icon list when you
 * Add to Home Screen and uses this one, so it has to exist separately from
 * /icons/*. Next links it as <link rel="apple-touch-icon"> automatically.
 *
 * iOS rounds the corners itself and composites over black if the image has
 * transparency, so this stays a fully opaque square with no rounding of its
 * own — otherwise the corners come out dark.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          background: '#ff8c00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'serif',
          fontWeight: 900,
          fontSize: 122,
          color: '#000',
          letterSpacing: '-5px',
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
