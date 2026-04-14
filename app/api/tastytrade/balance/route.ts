import { NextResponse } from 'next/server';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { getValidAccessToken } from '@/lib/auth/session';

export async function GET() {
  try {
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

    const client = getTastytradeClient(accessToken);
    const account = await client.getAccountBalance();

    console.log('💰 Tastytrade balance response:', JSON.stringify(account, null, 2));

    return NextResponse.json({
      success: true,
      data: account,
    });
  } catch (error: any) {
    console.error('Error fetching Tastytrade balance:', error);

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
        error: error.message || 'Failed to fetch account balance',
      },
      { status: 500 }
    );
  }
}



