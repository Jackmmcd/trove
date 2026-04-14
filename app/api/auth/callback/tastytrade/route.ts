import { NextRequest, NextResponse } from 'next/server';
import { getTastytradeClient } from '@/lib/tastytrade/client';
import { setSession, getOAuthState, clearOAuthState } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    // Validate required parameters
    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/?error=missing_parameters', request.url)
      );
    }

    // Verify state to prevent CSRF attacks
    const storedState = await getOAuthState();
    if (!storedState || storedState !== state) {
      console.error('State mismatch:', { stored: storedState, received: state });
      return NextResponse.redirect(
        new URL('/?error=invalid_state', request.url)
      );
    }

    // Clear the state cookie
    await clearOAuthState();

    // Exchange authorization code for access token
    const client = getTastytradeClient();
    const tokens = await client.exchangeCodeForToken(code);

    // Store tokens in session
    await setSession(tokens);

    // Redirect to dashboard
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error: any) {
    console.error('Callback error:', error);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error.message || 'authentication_failed')}`, request.url)
    );
  }
}
