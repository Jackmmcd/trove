import { ImageResponse } from 'next/og';

/**
 * The manifest's PNG icons, rendered on demand instead of committed as
 * binaries — the mark is two glyphs on a flat field, so generating it keeps
 * the icon and the in-app logo from drifting apart.
 *
 * `/icons/192`, `/icons/512`, and `/icons/512?maskable=1` for the padded
 * variant launchers crop to a circle.
 */

const SIZES = new Set([180, 192, 512]);

export function generateStaticParams() {
  return [...SIZES].map(s => ({ size: String(s) }));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) {
    return new Response('Unsupported icon size', { status: 404 });
  }

  // A maskable icon must survive a circular crop, so the glyph sits inside the
  // middle 80% and the amber runs to the edges instead of the other way round.
  const maskable = new URL(req.url).searchParams.get('maskable') === '1';
  const fontSize = maskable ? size * 0.46 : size * 0.68;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: '#ff8c00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'serif',
          fontWeight: 900,
          fontSize,
          color: '#000',
          letterSpacing: `${-size * 0.03}px`,
        }}
      >
        T
      </div>
    ),
    { width: size, height: size },
  );
}
