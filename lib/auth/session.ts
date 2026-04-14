import { cookies } from 'next/headers';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'tastytrade_session';
const STATE_COOKIE_NAME = 'oauth_state';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Encryption key - in production, use a secure environment variable
const ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY || 'default-insecure-key-change-in-production-32chars';
const ALGORITHM = 'aes-256-cbc';

export interface SessionData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  created_at: number;
}

/**
 * Encrypt data using AES-256-CBC
 */
function encrypt(text: string): string {
  // Ensure key is 32 bytes
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return IV + encrypted data
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt data using AES-256-CBC
 */
function decrypt(text: string): string {
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Set the session with OAuth tokens
 */
export async function setSession(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}): Promise<void> {
  const sessionData: SessionData = {
    ...tokens,
    created_at: Date.now(),
  };

  const encrypted = encrypt(JSON.stringify(sessionData));

  (await cookies()).set(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Get the current session data
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const decrypted = decrypt(sessionCookie.value);
    const sessionData: SessionData = JSON.parse(decrypted);
    return sessionData;
  } catch (error) {
    console.error('Failed to decrypt session:', error);
    return null;
  }
}

/**
 * Check if the session token is expired
 */
export function isSessionExpired(session: SessionData): boolean {
  const expiresAt = session.created_at + (session.expires_in * 1000);
  // Consider expired if within 5 minutes of expiry
  return Date.now() >= (expiresAt - 5 * 60 * 1000);
}

/**
 * Clear the session
 */
export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}

/**
 * Store OAuth state for CSRF protection
 */
export async function setOAuthState(state: string): Promise<void> {
  (await cookies()).set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });
}

/**
 * Get and verify OAuth state
 */
export async function getOAuthState(): Promise<string | null> {
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE_NAME);
  return stateCookie?.value || null;
}

/**
 * Clear OAuth state
 */
export async function clearOAuthState(): Promise<void> {
  (await cookies()).delete(STATE_COOKIE_NAME);
}

/**
 * Authenticate using session-based auth (username/password)
 */
async function authenticateWithSession(): Promise<string | null> {
  const username = process.env.TASTYTRADE_USERNAME;
  const password = process.env.TASTYTRADE_PASSWORD;

  console.log('🔐 Attempting Tastytrade session auth...');
  console.log('Username:', username ? `${username.slice(0, 3)}***` : 'NOT SET');
  console.log('Password:', password ? '***SET***' : 'NOT SET');

  if (!username || !password) {
    console.error('❌ Username or password not set in .env');
    return null;
  }

  try {
    const axios = (await import('axios')).default;

    console.log('📡 Posting to https://api.tastytrade.com/sessions');
    const response = await axios.post('https://api.tastytrade.com/sessions', {
      login: username,
      password: password,
      'remember-me': true,
    });

    console.log('✅ Session API response:', JSON.stringify(response.data, null, 2));

    const sessionToken = response.data.data?.['session-token'] || response.data['session-token'];

    if (sessionToken) {
      console.log('✅ Session token obtained:', sessionToken.slice(0, 10) + '...');

      // Store as a session with short expiry (session tokens last 15 minutes)
      await setSession({
        access_token: sessionToken,
        refresh_token: sessionToken, // Session tokens don't have separate refresh tokens
        expires_in: 900, // 15 minutes
        token_type: 'Bearer',
      });

      return sessionToken;
    }

    console.error('❌ No session token in response');
    return null;
  } catch (error: any) {
    console.error('❌ Session authentication failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);
    return null;
  }
}

/**
 * Authenticate using OAuth refresh token
 */
async function authenticateWithRefreshToken(): Promise<string | null> {
  const refreshToken = process.env.TASTYTRADE_REFRESH_TOKEN;

  if (!refreshToken) {
    return null;
  }

  try {
    const { getTastytradeClient } = await import('../tastytrade/client');
    const client = getTastytradeClient();

    const refreshed = await client.refreshAccessToken(refreshToken);

    // Store the new tokens
    await setSession({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_in: refreshed.expires_in,
      token_type: 'Bearer',
    });

    return refreshed.access_token;
  } catch (error) {
    console.error('OAuth refresh token authentication failed:', error);
    return null;
  }
}

/**
 * Get a session token via username/password — used for endpoints that require
 * full user permissions not available via the OAuth scope (e.g. ACH/transfers).
 * Does NOT overwrite the stored session.
 */
export async function getSessionToken(): Promise<string | null> {
  const username = process.env.TASTYTRADE_USERNAME;
  const password = process.env.TASTYTRADE_PASSWORD;
  if (!username || !password) return null;
  try {
    const axios = (await import('axios')).default;
    const response = await axios.post('https://api.tastytrade.com/sessions', {
      login: username,
      password: password,
      'remember-me': false,
    });
    return response.data.data?.['session-token'] || response.data['session-token'] || null;
  } catch {
    return null;
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getSession();

  // If we have a valid session, return the token
  if (session && !isSessionExpired(session)) {
    return session.access_token;
  }

  // If session exists but is expired, try to refresh
  if (session && isSessionExpired(session)) {
    try {
      const { getTastytradeClient } = await import('../tastytrade/client');
      const client = getTastytradeClient();

      const refreshed = await client.refreshAccessToken(session.refresh_token);

      await setSession({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_in: refreshed.expires_in,
        token_type: 'Bearer',
      });

      return refreshed.access_token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      await clearSession();
      // Fall through to try other auth methods
    }
  }

  // No valid session, try to authenticate using environment variables
  // Try OAuth refresh token first (preferred method)
  const oauthToken = await authenticateWithRefreshToken();
  if (oauthToken) {
    return oauthToken;
  }

  // Fall back to session-based auth (deprecated but works)
  const sessionToken = await authenticateWithSession();
  if (sessionToken) {
    return sessionToken;
  }

  return null;
}
