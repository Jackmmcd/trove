import { NextResponse } from 'next/server';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';
import { AlpacaClient } from '@/lib/alpaca/client';

export async function GET(request: Request) {
  try {
    if (process.env.BROKER === 'alpaca') {
      const client = new AlpacaClient();
      const positions = await client.getPositions();
      return NextResponse.json({ success: true, data: positions });
    }

    // Get access token from session
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Not authenticated. Please log in.',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const accountNumber = searchParams.get('accountNumber') || undefined;

    const client = getTastytradeClient(accessToken);
    const positions = await client.getPositions(accountNumber);

    console.log('📊 Tastytrade positions response:', JSON.stringify(positions?.slice(0, 2), null, 2));

    return NextResponse.json({
      success: true,
      data: positions,
    });
  } catch (error: any) {
    console.error('Error fetching Tastytrade positions:', error);

    // Handle unauthorized errors
    if (error.message?.includes('Unauthorized') || error.message?.includes('Not authenticated')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required. Please log in again.',
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch positions',
      },
      { status: 500 }
    );
  }
}



