import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Which account the dashboard should show: the connected brokerage, or paper.
 *
 * The Tastytrade and Alpaca routes authenticate with a single set of
 * credentials from the environment — there is no per-user brokerage link in
 * the data model. So the brokerage view can only ever show ONE real account,
 * and the only safe rule is that it belongs to whoever owns those credentials.
 * Everybody else gets their own paper account.
 *
 * This decision is made server-side on purpose. It was previously inferred on
 * the client from "did the paper balance call fail?", which meant any error
 * showed a stranger the owner's live positions.
 */
function brokerOwners(): string[] {
  return (process.env.BROKER_OWNER_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

export async function GET() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const email = (user.email ?? '').toLowerCase();
  const owners = brokerOwners();
  const isOwner = owners.length > 0 && owners.includes(email);

  return NextResponse.json({ source: isOwner ? 'broker' : 'paper' });
}
