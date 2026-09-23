import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { isBrokerOwner, brokerOwnerReason } from '@/lib/broker/owner';

export const dynamic = 'force-dynamic';

/**
 * Which account the dashboard should show: the connected brokerage, or paper.
 *
 * The ownership rule and the parsing of BROKER_OWNER_EMAILS live in
 * lib/broker/owner.ts, shared with the Analyst's portfolio reader so the two
 * can't disagree about which account you are looking at.
 *
 * This decision is made server-side on purpose. It was previously inferred on
 * the client from "did the paper balance call fail?", which meant any error
 * showed a stranger the owner's live positions.
 */
export async function GET() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const email = user.email ?? null;
  const isOwner = isBrokerOwner(email);

  return NextResponse.json({
    source: isOwner ? 'broker' : 'paper',
    // Why you got this account. Names no configured address — just the one you
    // are signed in as — so that landing on the wrong account is diagnosable
    // from the browser instead of guessed at from the hosting dashboard.
    reason: brokerOwnerReason(email),
    signedInAs: email,
  });
}
