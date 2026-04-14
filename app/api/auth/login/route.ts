import { NextResponse } from 'next/server';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { setOAuthState } from '@/lib/auth/session';
import crypto from 'crypto';

export async function GET() {
  try {
    // Generate random state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in cookie
    await setOAuthState(state);

    // Get Tastytrade client and authorization URL
    const client = getTastytradeClient();
    const authUrl = client.getAuthorizationUrl(state);

    // Redirect to Tastytrade authorization page
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate login', message: error.message },
      { status: 500 }
    );
  }
}
