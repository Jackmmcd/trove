import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { isBrokerOwner } from './owner';

/**
 * Server-side guards for the live brokerage routes.
 *
 * These routes authenticate with a single set of credentials from the
 * environment, so they are not "the caller's account" — they are the owner's
 * account, and any request that reaches them acts as the owner. They had no
 * checks at all: not an ownership check, not even a signed-in check. The only
 * thing deciding whether a real order was placed was a boolean in the client,
 * and that boolean was being computed wrongly.
 *
 * The middleware allowlist already keeps strangers out of the app. This is the
 * layer underneath it, so a UI bug or a future allowlist entry cannot put
 * someone else's money at risk.
 */

/** Caller must be signed in. For market data, which carries no account state. */
export async function requireSignedIn(): Promise<NextResponse | null> {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
  }
  return null;
}

/**
 * Caller must own the brokerage credentials. For anything that reads the real
 * account's money or moves it.
 */
export async function requireBrokerOwner(): Promise<NextResponse | null> {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
  }
  if (!isBrokerOwner(user.email)) {
    return NextResponse.json(
      { success: false, error: 'This account does not have brokerage access.' },
      { status: 403 },
    );
  }
  return null;
}
