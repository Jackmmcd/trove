import { findTickers } from '../tickers';

/**
 * Cases taken from real Analyst output. The naive matcher highlighted the B in
 * "Broadcom", the B in "Both", and the Q in "2026-Q2" — all genuine symbols,
 * wrong in context — and then offered "Who else owns Q?" as a follow-up chip.
 */
const known = new Set([
  'Q', 'B', 'V', 'F', 'T', 'A', 'I', 'SO', 'ON', 'IT',
  'AMZN', 'META', 'NVDA', 'XYZ', 'QQQ', 'IGV', 'IHI', 'SMH', 'RSP',
  'TSM', 'FLS', 'GOOGL', 'SATS', 'ECHO',
]);

describe('findTickers', () => {
  describe('rejects false positives seen in production', () => {
    it.each([
      ['quarter labels', 'both filed for 2026-Q2.'],
      ['quarter in a question', 'How did Q change between 2026-Q1 and 2026-Q2?'],
      ['capitalised company names', 'exiting Meta, Nvidia, Broadcom, KLA and Lam.'],
      ['sentence-initial capitals', 'Both filings are as of 2026-06-30'],
      ['a bare pronoun', 'I think the position is small'],
      ['an article', 'A fund named Third Point'],
    ])('%s', (_label, text) => {
      expect(findTickers(text, known)).toEqual([]);
    });
  });

  describe('keeps real mentions', () => {
    it('finds multi-letter symbols', () => {
      expect(findTickers('AMZN 11.5% and META 4.2%', known)).toEqual(['AMZN', 'META']);
    });

    it('finds ETF symbols in a list', () => {
      expect(findTickers('It opened IGV at 6.3% (software ETF), IHI at 3.0%', known))
        .toEqual(['IGV', 'IHI']);
    });

    it('finds a symbol adjacent to a percentage', () => {
      expect(findTickers('roughly ten-folded QQQ to 11.3%.', known)).toEqual(['QQQ']);
    });

    it('finds a symbol alongside a quarter reference', () => {
      expect(findTickers('TSM at 4.2% as of 2026-Q2', known)).toEqual(['TSM']);
    });

    // Single letters are real tickers but read as initials in prose, so they
    // only count when the writer disambiguated them the way people actually do.
    it('accepts a parenthesised single letter', () => {
      expect(findTickers('Visa (V) is a top holding', known)).toEqual(['V']);
    });

    it('accepts a parenthesised symbol after a company name', () => {
      expect(findTickers('Block (XYZ) 4.2%', known)).toEqual(['XYZ']);
    });
  });

  it('deduplicates, preserving first-mention order', () => {
    expect(findTickers('META then AMZN then META again', known)).toEqual(['META', 'AMZN']);
  });

  it('returns nothing when no symbols are known', () => {
    expect(findTickers('AMZN and META', new Set())).toEqual([]);
  });
});
