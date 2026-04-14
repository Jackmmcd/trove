import { NextRequest, NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    // Clear the session
    await clearSession();

    // Redirect to home page
    return NextResponse.redirect(new URL('/', request.url));
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Support both GET and POST for logout
  return GET(request);
}
