import { NextResponse } from 'next/server';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please log in.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { symbol, quantity, action } = body;

    if (!symbol || !quantity || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: symbol, quantity, action' },
        { status: 400 }
      );
    }

    if (!['buy', 'sell'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "buy" or "sell"' },
        { status: 400 }
      );
    }

    const client = getTastytradeClient(accessToken);
    const result = await client.placeOrder(undefined, { symbol, quantity: Number(quantity), action });

    console.log('📈 Order placed:', JSON.stringify(result, null, 2));

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error placing order:', error);

    if (error.message?.includes('Unauthorized') || error.message?.includes('Not authenticated')) {
      return NextResponse.json(
        { success: false, error: 'Authentication required. Please log in again.' },
        { status: 401 }
      );
    }

    // Surface the raw Tastytrade response for debugging
    const detail = error.response?.data ?? null;
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to place order', detail },
      { status: 500 }
    );
  }
}
