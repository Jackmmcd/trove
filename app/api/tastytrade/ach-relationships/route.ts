import { NextResponse } from 'next/server';
import { getValidAccessToken, getSessionToken } from '@/lib/auth/session';
import { getTastytradeClient } from '@/lib/tastytrade/client';

async function fetchRelationships(token: string) {
  const client = getTastytradeClient(token);
  const items = await client.getAchRelationships();
  return items.map((r: any) => ({
    id: r.id,
    bankName: r['bank-name'] ?? r.bankName ?? 'Bank',
    nameOnAccount: r['bank-account-owner-name'] ?? r['name-on-account'] ?? r.nameOnAccount ?? '',
    last4: r['bank-account-number'] ? String(r['bank-account-number']).slice(-4) : r.last4 ?? '****',
    status: r.status ?? 'Unknown',
  }));
}

export async function GET() {
  try {
    // Try OAuth token first
    const oauthToken = await getValidAccessToken();
    if (!oauthToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    try {
      const relationships = await fetchRelationships(oauthToken);
      return NextResponse.json({ success: true, data: relationships });
    } catch (err: any) {
      // OAuth token lacks funding scope — fall back to session auth
      const status = err?.response?.status ?? (err?.message?.includes('403') ? 403 : 0);
      if (status !== 403) throw err;
    }

    // Fall back: get a fresh session token (has full user permissions)
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      return NextResponse.json({
        success: false,
        error: 'Your OAuth token does not have funding permissions. Add TASTYTRADE_USERNAME and TASTYTRADE_PASSWORD to .env to enable this feature.',
      }, { status: 403 });
    }

    const relationships = await fetchRelationships(sessionToken);
    return NextResponse.json({ success: true, data: relationships });
  } catch (error: any) {
    if (error.message?.includes('Unauthorized') || error.message?.includes('Not authenticated')) {
      return NextResponse.json({ success: false, error: 'Authentication required', requiresAuth: true }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
