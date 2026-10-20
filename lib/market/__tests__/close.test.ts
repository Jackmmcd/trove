import { completedSessions, regularSessionIsOver } from '../close';

/** A UTC instant, so each case pins an exact Eastern wall-clock time. */
const at = (iso: string) => new Date(iso);

describe('regularSessionIsOver', () => {
  // Eastern is UTC-4 in October (daylight saving), so 16:00 ET = 20:00 UTC.
  it('is false while the session is still running', () => {
    expect(regularSessionIsOver(at('2026-10-19T14:30:00Z'))).toBe(false); // 10:30 ET
    expect(regularSessionIsOver(at('2026-10-19T19:59:00Z'))).toBe(false); // 15:59 ET
  });

  it('is true from the closing bell onward', () => {
    expect(regularSessionIsOver(at('2026-10-19T20:00:00Z'))).toBe(true);  // 16:00 ET
    expect(regularSessionIsOver(at('2026-10-19T23:30:00Z'))).toBe(true);  // 19:30 ET
  });

  it('reads the Eastern date, not UTC', () => {
    // 01:00 UTC Tuesday is still 21:00 ET Monday — after Monday's close.
    expect(regularSessionIsOver(at('2026-10-20T01:00:00Z'))).toBe(true);
    // 08:00 UTC is 04:00 ET, long before the bell.
    expect(regularSessionIsOver(at('2026-10-20T08:00:00Z'))).toBe(false);
  });
});

describe('completedSessions', () => {
  const week = [
    { date: '2026-10-15', close: 100 }, // Thu
    { date: '2026-10-16', close: 101 }, // Fri
    { date: '2026-10-19', close: 102 }, // Mon
  ];

  it("drops today's candle while the session is still open", () => {
    // Monday 10:30 ET — Monday's candle is still moving.
    const out = completedSessions(week, at('2026-10-19T14:30:00Z'));
    expect(out.map(d => d.date)).toEqual(['2026-10-15', '2026-10-16']);
  });

  it("keeps today's candle once the bell has gone", () => {
    const out = completedSessions(week, at('2026-10-19T20:30:00Z')); // 16:30 ET
    expect(out.map(d => d.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-19']);
  });

  it('holds Friday all weekend', () => {
    const upToFriday = week.slice(0, 2);
    for (const when of [
      '2026-10-17T15:00:00Z', // Saturday
      '2026-10-18T15:00:00Z', // Sunday
      '2026-10-19T12:00:00Z', // Monday pre-market
    ]) {
      const out = completedSessions(upToFriday, at(when));
      expect(out[out.length - 1].date).toBe('2026-10-16');
    }
  });

  it('leaves a gap alone — a missing day is a holiday, not an open session', () => {
    // No candle for today at all, mid-session: nothing to trim.
    const out = completedSessions(week.slice(0, 2), at('2026-10-19T14:30:00Z'));
    expect(out.map(d => d.date)).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('handles an empty history without throwing', () => {
    expect(completedSessions([], at('2026-10-19T14:30:00Z'))).toEqual([]);
  });
});
