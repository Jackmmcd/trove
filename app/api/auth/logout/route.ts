import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { origin } = new URL(req.url);
  const res = NextResponse.redirect(`${origin}/login`);
  res.cookies.set('app_session', '', { maxAge: 0, path: '/' });
  return res;
}
