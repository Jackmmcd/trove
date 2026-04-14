import { NextResponse } from 'next/server';
import { getValidAccessToken, getSessionToken } from '@/lib/auth/session';
import { getTastytradeClient } from '@/lib/tastytrade/client';

async function getTokenWithFundingAccess(): Promise<string | null> {
  // Try OAuth token first; if it lacks funding scope (403), fall back to session token
  const oauthToken = await getValidAccessToken();
  if (!oauthToken) return null;

  // We'll return the OAuth token and let the caller handle 403 fallback
  return oauthToken;
}

/** POST /api/tastytrade/transfers — initiate ACH deposit or withdrawal */
export async function POST(request: Request) {
  try {
    const token = await getTokenWithFundingAccess();
    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { achRelationshipId, amount, direction } = await request.json();

    if (!achRelationshipId || !amount || !direction) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (direction !== 'Deposit' && direction !== 'Withdrawal') {
      return NextResponse.json({ success: false, error: 'direction must be "Deposit" or "Withdrawal"' }, { status: 400 });
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }

    const transferArgs = { achRelationshipId, amount: parsedAmount.toFixed(2), direction };

    async function attemptTransfer(tok: string) {
      const client = getTastytradeClient(tok);
      return client.createTransfer(undefined, transferArgs);
    }

    try {
      const result = await attemptTransfer(token);
      return NextResponse.json({ success: true, data: result });
    } catch (err: any) {
      const status = err?.response?.status ?? (err?.message?.includes('403') ? 403 : 0);
      if (status !== 403) throw err;
      // Fall back to session token
      const sessionToken = await getSessionToken();
      if (!sessionToken) throw err;
      const result = await attemptTransfer(sessionToken);
      return NextResponse.json({ success: true, data: result });
    }
  } catch (error: any) {
    if (error.message?.includes('Unauthorized') || error.message?.includes('Not authenticated')) {
      return NextResponse.json({ success: false, error: 'Authentication required', requiresAuth: true }, { status: 401 });
    }
    const apiMsg = error?.response?.data?.error?.message
      ?? error?.response?.data?.errors?.[0]?.message
      ?? error.message;
    return NextResponse.json({ success: false, error: apiMsg }, { status: error?.response?.status ?? 500 });
  }
}

/** GET /api/tastytrade/transfers — list recent ACH transfers */
export async function GET() {
  try {
    const oauthToken = await getValidAccessToken();
    if (!oauthToken) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    async function fetchTransfers(tok: string) {
      const client = getTastytradeClient(tok);
      const items = await client.getTransfers();
      return items.map((t: any) => ({
        id: t.id,
        direction: t.direction,
        amount: parseFloat(t.amount ?? '0'),
        status: t.status,
        createdAt: t['created-at'] ?? t.createdAt,
        bankName: t['ach-relationship']?.['bank-name'] ?? t.bankName ?? '',
      }));
    }

    try {
      const transfers = await fetchTransfers(oauthToken);
      return NextResponse.json({ success: true, data: transfers });
    } catch (err: any) {
      const status = err?.response?.status ?? (err?.message?.includes('403') ? 403 : 0);
      if (status !== 403) throw err;
      const sessionToken = await getSessionToken();
      if (!sessionToken) return NextResponse.json({ success: true, data: [] });
      const transfers = await fetchTransfers(sessionToken);
      return NextResponse.json({ success: true, data: transfers });
    }
  } catch (error: any) {
    if (error.message?.includes('Unauthorized') || error.message?.includes('Not authenticated')) {
      return NextResponse.json({ success: false, error: 'Authentication required', requiresAuth: true }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: error?.response?.status ?? 500 });
  }
}
