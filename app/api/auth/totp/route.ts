import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((value >> bits) & 0xff); }
  }
  return Buffer.from(out);
}

function generateTotpSecret(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return Array.from(crypto.randomBytes(20)).map(b => alphabet[b % 32]).join('');
}

function totpToken(secret: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
  return String(code).padStart(6, '0');
}

function verifyTotp(token: string, secret: string): boolean {
  // Allow ±1 time step for clock drift
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let delta = -1; delta <= 1; delta++) {
    const c = counter + delta;
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(c / 2 ** 32), 0);
    buf.writeUInt32BE(c >>> 0, 4);
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000;
    if (String(code).padStart(6, '0') === token) return true;
  }
  return false;
}

export async function GET() {
  const totpSecret = process.env.TOTP_SECRET;
  const isNew = !totpSecret;
  const secret = totpSecret || generateTotpSecret();
  const otpauth = `otpauth://totp/Trove:admin?secret=${secret}&issuer=Trove&algorithm=SHA1&digits=6&period=30`;
  const qr = await QRCode.toDataURL(otpauth);
  return NextResponse.json({ success: true, qr, isNew, ...(isNew ? { secret } : {}) });
}

export async function POST(req: Request) {
  const { code, passwordToken } = await req.json();
  const jwtSecret = process.env.JWT_SECRET!;

  try {
    jwt.verify(passwordToken, jwtSecret);
  } catch {
    return NextResponse.json({ success: false, error: 'Session expired' }, { status: 401 });
  }

  const totpSecret = process.env.TOTP_SECRET;
  if (!totpSecret) return NextResponse.json({ success: false, error: 'TOTP not configured' }, { status: 400 });

  if (!verifyTotp(code, totpSecret)) return NextResponse.json({ success: false, error: 'Invalid code' }, { status: 401 });

  const sessionToken = jwt.sign({ auth: true }, jwtSecret, { expiresIn: '7d' });
  const res = NextResponse.json({ success: true });
  res.cookies.set('app_session', sessionToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7, path: '/' });
  return res;
}
