import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

const PUBLIC = ['/login', '/api/auth/login', '/api/auth/totp', '/api/auth/logout'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get('trove_session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));

  try {
    await jwtVerify(token, secret());
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.set('trove_session', '', { maxAge: 0, path: '/' });
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
