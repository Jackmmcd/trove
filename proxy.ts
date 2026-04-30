import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auth disabled for local development
export function proxy(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
