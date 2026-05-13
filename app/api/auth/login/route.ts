import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { password } = await req.json();
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  if (password !== appPassword) return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });

  const secret = process.env.JWT_SECRET!;
  const totpSecret = process.env.TOTP_SECRET;

  // If TOTP not configured, skip 2FA and set full session immediately
  if (!totpSecret) {
    const token = jwt.sign({ auth: true }, secret, { expiresIn: '7d' });
    const res = NextResponse.json({ success: true, skipTotp: true });
    res.cookies.set('app_session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
    return res;
  }

  // TOTP configured: return temp token for 2FA step
  const token = jwt.sign({ passwordVerified: true }, secret, { expiresIn: '10m' });
  return NextResponse.json({ success: true, token });
}
