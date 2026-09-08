import { suggestFollowUps } from '../followups';

const known = new Set(['TDG', 'ECHO', 'NVDA', 'AMZN', 'WBD']);

describe('suggestFollowUps', () => {
  it('never offers a time comparison when the reply says there is no history', () => {
    const reply =
      'Silver Point Capital holds it at 11.6% as of 2026-Q2. Silver Point has no ' +
      'prior-quarter filing on record, so there is nothing to compare against.';
    const chips = suggestFollowUps(reply, known);
    expect(chips.some(c => /change between/i.test(c))).toBe(false);
  });

  it('asks about the equity when the reply is about debt', () => {
    const reply =
      'Silver Point Capital holds ECHO debt at 11.6% as of 2026-Q2 — a bet on the ' +
      'bonds getting paid, not on the shares re-rating.';
    expect(suggestFollowUps(reply, known)).toContain('Which funds hold ECHO equity rather than its debt?');
  });

  it('follows an activist mention with an activist question', () => {
    const reply = 'Third Point LLC runs an activist book and opened Warner Bros Discovery at 11.4% in 2026-Q2.';
    expect(suggestFollowUps(reply, known).some(c => /activist position/i.test(c))).toBe(true);
  });

  it('follows exits with an exit question', () => {
    const reply = 'Third Point LLC exited Meta, Nvidia and Broadcom during 2026-Q2.';
    expect(suggestFollowUps(reply, known).some(c => /exit\?/i.test(c))).toBe(true);
  });

  it('does not re-ask about a company the reply said is untracked', () => {
    const reply = 'No fund called Pennant is among those Trove tracks, so I cannot tell you what it holds.';
    const chips = suggestFollowUps(reply, known);
    expect(chips.some(c => /Who else owns/i.test(c))).toBe(false);
  });

  it('offers entity-type follow-up when the reply leans on non-hedge-fund filers', () => {
    const reply =
      'Support comes mostly from an endowment and two venture firms, so this is weaker ' +
      'than the holder count suggests. Harvard Management holds it at 5.6% in 2026-Q2.';
    expect(suggestFollowUps(reply, known).some(c => /actual hedge funds/i.test(c))).toBe(true);
  });

  it('varies the subject rather than repeating one fund', () => {
    const reply =
      'Third Point LLC holds NVDA at 4.2% and AMZN at 3.1% as of 2026-Q2, and added to both.';
    const chips = suggestFollowUps(reply, known);
    expect(new Set(chips).size).toBe(chips.length);
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it('falls back to answerable generics when nothing is nameable', () => {
    const reply = 'That is outside what quarterly institutional disclosures can tell you, unfortunately.';
    const chips = suggestFollowUps(reply, known);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips).toContain('Which names are the most funds crowding into?');
  });

  it('returns nothing for a reply too short to draw from', () => {
    expect(suggestFollowUps('Yes.', known)).toEqual([]);
  });
});
