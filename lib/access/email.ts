/**
 * Normalising an address before comparing it.
 *
 * Values typed into a hosting dashboard pick up things `split(',')` alone does
 * not survive: wrapping quotes from a copied shell line, a `mailto:` prefix,
 * `Name <addr>` form, stray semicolons, non-breaking spaces. Any of those make
 * a comparison fail silently — which, for an allowlist, fails open or locks
 * the owner out depending on which side it lands on. Both are bad, so there is
 * exactly one implementation and everything that compares addresses uses it.
 */
export function normaliseEmail(raw: string): string {
  return raw
    .replace(/ /g, ' ')
    .trim()
    .replace(/^["'`<]+|["'`>;,]+$/g, '')
    .replace(/^mailto:/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Parse a comma/semicolon/whitespace-separated address list from an env var.
 * A bare word with no "@" is a misconfiguration, not an address; dropping it
 * keeps a typo from widening access.
 */
export function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,;\s]+/)
    .map(normaliseEmail)
    .filter(e => e.includes('@'));
}
