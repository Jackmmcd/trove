import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

// GET — return QR code for first-time setup
export async function GET() {
  let totpSecret = process.env.TOTP_SECRET;
  let isNew = false;
  if (!totpSecret) {
    totpSecret = authenticator.generateSecret();
    isNew = true;
  }
  const otpauth = authenticator.keyuri('trove', 'Trove 13F', totpSecret);
  const qr = await QRCode.toDataURL(otpauth);
  return NextResponse.json({ success: true, qr, isNew, secret: isNew ? totpSecret : undefined });
}

// POST — verify code, issue session cookie
export async function POST(req: Request) {
  const { code, passwordToken } = await req.json();
  try {
    await jwtVerify(passwordToken, secret());
  } catch {
    return NextResponse.json({ success: false, error: 'Password token expired — go back and re-enter password' }, { status: 401 });
  }
  const totpSecret = process.env.TOTP_SECRET;
  if (!totpSecret) {
    return NextResponse.json({ success: false, error: 'TOTP not configured' }, { status: 503 });
  }
  if (!authenticator.verify({ token: code, secret: totpSecret })) {
    return NextResponse.json({ success: false, error: 'Invalid code' }, { status: 401 });
  }
  const sessionToken = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret());
  const res = NextResponse.json({ success: true });
  res.cookies.set('trove_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
  return res;
}
