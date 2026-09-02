import jwt from 'jsonwebtoken';

/**
 * Email gate for the public Ed demo on the landing page.
 *
 * This is an allowlist, not authentication — anyone who knows an allowed
 * address gets in, and there is no verification that they own it. It exists to
 * keep the demo off the open internet, not to establish identity.
 *
 * Two deliberate choices that cost nothing now and matter later:
 *  - The allowlist stays server-side. The browser never receives it, so the
 *    list of addresses is not discoverable from the client bundle.
 *  - A successful check issues a short-lived signed cookie. Subsequent requests
 *    carry that, rather than re-sending an email the server would have to trust
 *    on every call.
 */

const COOKIE = 'ed_demo_access';
const TTL_HOURS = 24;

function secret(): string {
  return process.env.JWT_SECRET || process.env.SESSION_ENCRYPTION_KEY || 'insecure-dev-secret';
}

/** Allowlist from env, plus the owner's address as the built-in default. */
function allowed(): string[] {
  const fromEnv = (process.env.ED_DEMO_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return fromEnv.length ? fromEnv : ['mmcd.jack@gmail.com'];
}

export function isAllowedEmail(email: string): boolean {
  return allowed().includes(email.trim().toLowerCase());
}

export function issueAccessToken(email: string): { token: string; maxAge: number } {
  const maxAge = TTL_HOURS * 3600;
  const token = jwt.sign({ email: email.trim().toLowerCase(), scope: 'ed-demo' }, secret(), {
    expiresIn: maxAge,
  });
  return { token, maxAge };
}

export function verifyAccessToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret()) as { email?: string; scope?: string };
    if (payload.scope !== 'ed-demo' || !payload.email) return null;
    // Re-check the allowlist on every request so revoking an address takes
    // effect immediately rather than when the cookie happens to expire.
    return isAllowedEmail(payload.email) ? payload.email : null;
  } catch {
    return null;
  }
}

export const ACCESS_COOKIE = COOKIE;
