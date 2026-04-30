import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32, height: 32,
          background: '#ff8c00',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'serif',
          fontWeight: 900,
          fontSize: 22,
          color: '#000',
          letterSpacing: '-1px',
        }}
      >
        T
      </div>
    ),
    { ...size }
  );
}
