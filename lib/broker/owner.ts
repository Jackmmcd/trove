/**
 * Who owns the brokerage credentials.
 *
 * The Tastytrade and Alpaca routes authenticate with a single set of
 * credentials from the environment — there is no per-user brokerage link in
 * the data model. So the brokerage view can only ever show ONE real account,
 * and the only safe rule is that it belongs to whoever owns those credentials.
 * Everybody else gets their own paper account.
 *
 * This lived in two copies (the account-source route and the Analyst's
 * portfolio reader) that had to agree or the Analyst and the dashboard would
 * disagree about which account the user was looking at. One copy now.
 */

/**
 * The address the deployment belongs to when BROKER_OWNER_EMAILS is missing or
 * unparseable. Falling back to paper instead looks like a bug to the one person
 * the live view is for — the dashboard silently shows a $10k simulated account
 * with no explanation — while falling back to this address can only ever admit
 * the owner. `lib/advisor/access.ts` already takes the same approach.
 */
const DEFAULT_OWNER = 'mmcd.jack@gmail.com';

/**
 * Normalise one configured address.
 *
 * Values typed into a hosting dashboard pick up things `split(',')` alone does
 * not survive: wrapping quotes from a copied shell line, a `mailto:` prefix,
 * `Name <addr>` form, stray semicolons, non-breaking spaces. Any of those made
 * the comparison fail silently and dropped the owner to paper.
 */
function normalise(raw: string): string {
  return raw
    .replace(/ /g, ' ')
    .trim()
    .replace(/^["'`<]+|["'`>;,]+$/g, '')
    .replace(/^mailto:/i, '')
    .trim()
    .toLowerCase();
}

/** Addresses allowed to see the live brokerage account. */
export function brokerOwnerEmails(): string[] {
  const configured = (process.env.BROKER_OWNER_EMAILS ?? '')
    .split(/[,;\s]+/)
    .map(normalise)
    // A bare word with no "@" is a misconfiguration, not an address; ignoring
    // it keeps a typo from widening access.
    .filter(e => e.includes('@'));

  return configured.length > 0 ? configured : [DEFAULT_OWNER];
}

export function isBrokerOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return brokerOwnerEmails().includes(normalise(email));
}

/**
 * Why a given address did or did not get the live account. Carries no
 * configured address, so it is safe to return to the signed-in user.
 */
export function brokerOwnerReason(email: string | null | undefined):
  'owner' | 'not-owner' | 'no-email' {
  if (!email) return 'no-email';
  return isBrokerOwner(email) ? 'owner' : 'not-owner';
}
