import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export async function POST(req: Request) {
  const { password } = await req.json();
  if (!password || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ success: false, error: 'Invalid password' }, { status: 401 });
  }
  // Short-lived token — TOTP still required to get a full session
  const token = await new SignJWT({ step: 'password' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('10m')
    .sign(secret());
  return NextResponse.json({ success: true, token });
}
