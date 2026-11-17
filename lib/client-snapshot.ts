/**
 * Last-seen page data kept in this browser so a fresh visit can draw at once
 * and refresh behind it, instead of opening on a loading screen every time.
 *
 * Keyed by the signed-in user's id, so one person's snapshot is never drawn
 * for another account in the same browser, and cleared on logout. Every read
 * and write is guarded: private windows and blocked storage just mean no
 * snapshot, never an error.
 */

const PREFIX = 'trove:snap:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readSnapshot<T>(name: string, userId: string): { value: T; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${name}:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T; savedAt: number };
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(name: string, userId: string, value: T): void {
  try {
    localStorage.setItem(`${PREFIX}${name}:${userId}`, JSON.stringify({ value, savedAt: Date.now() }));
  } catch { /* storage full or blocked */ }
}

export function clearSnapshots(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch { /* blocked */ }
}
