import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, isAllowedEmail, issueAccessToken, verifyAccessToken } from '@/lib/advisor/access';

export const dynamic = 'force-dynamic';

/** Whether this browser already has demo access. */
export async function GET() {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  const email = verifyAccessToken(token);
  return NextResponse.json({ access: !!email, email });
}

/** Exchange an allowlisted email for a signed access cookie. */
export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({ email: '' }));

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (!isAllowedEmail(email)) {
    // Deliberately does not distinguish "not on the list" from "list is empty",
    // so the response cannot be used to enumerate allowed addresses.
    return NextResponse.json(
      { error: 'That address does not have access yet.' },
      { status: 403 }
    );
  }

  const { token, maxAge } = issueAccessToken(email);
  (await cookies()).set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });

  return NextResponse.json({ access: true, email: email.trim().toLowerCase() });
}

/** Sign out of the demo. */
export async function DELETE() {
  (await cookies()).delete(ACCESS_COOKIE);
  return NextResponse.json({ access: false });
}
