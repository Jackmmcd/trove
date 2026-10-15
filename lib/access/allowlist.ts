import { normaliseEmail, parseEmailList } from './email';

/**
 * Who may use the signed-in app at all.
 *
 * This is separate from brokerage ownership (lib/broker/owner.ts, which only
 * decides live account vs paper) and from the Analyst demo allowlist
 * (lib/advisor/access.ts, which gates the logged-out demo on the landing
 * page). This one is the front door.
 *
 * It exists because Supabase signups are open at the project level by
 * default, and the publishable key ships in the client bundle by design — so
 * "there is no sign-up button in the UI" is not an access control. Anyone can
 * POST to the Supabase auth endpoint directly. Six accounts were created that
 * way before this gate existed.
 *
 * Belt and braces: disabling signups in the Supabase dashboard stops new
 * accounts, and this stops any account that already exists or slips through.
 */

/** The deployment's owner, used when APP_ALLOWED_EMAILS is missing or unparseable. */
const DEFAULT_OWNER = 'mmcd.jack@gmail.com';

/**
 * Addresses allowed through the front door.
 *
 * Falls back to the owner rather than to an empty list on purpose: an empty
 * allowlist would lock everyone out of the app including its owner, and a
 * misconfigured env var should not be able to do that.
 */
export function appAllowedEmails(): string[] {
  const configured = parseEmailList(process.env.APP_ALLOWED_EMAILS);
  return configured.length > 0 ? configured : [DEFAULT_OWNER];
}

export function isAppAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  return appAllowedEmails().includes(normaliseEmail(email));
}
