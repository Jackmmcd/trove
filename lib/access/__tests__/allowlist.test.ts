import { isAppAllowed, appAllowedEmails } from '../allowlist';
import { normaliseEmail, parseEmailList } from '../email';

const OWNER = 'mmcd.jack@gmail.com';

describe('normaliseEmail', () => {
  it('strips the things a hosting dashboard adds', () => {
    expect(normaliseEmail('  MMCD.Jack@Gmail.com  ')).toBe(OWNER);
    expect(normaliseEmail('"mmcd.jack@gmail.com"')).toBe(OWNER);
    expect(normaliseEmail("'mmcd.jack@gmail.com'")).toBe(OWNER);
    expect(normaliseEmail('<mmcd.jack@gmail.com>')).toBe(OWNER);
    expect(normaliseEmail('mailto:mmcd.jack@gmail.com')).toBe(OWNER);
    expect(normaliseEmail('mmcd.jack@gmail.com;')).toBe(OWNER);
    expect(normaliseEmail(' mmcd.jack@gmail.com ')).toBe(OWNER);
  });
});

describe('parseEmailList', () => {
  it('splits on commas, semicolons and whitespace', () => {
    expect(parseEmailList('a@x.com, b@y.com;c@z.com d@w.com'))
      .toEqual(['a@x.com', 'b@y.com', 'c@z.com', 'd@w.com']);
  });

  it('drops entries that are not addresses, so a typo cannot widen access', () => {
    expect(parseEmailList('a@x.com, oops, b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });

  it('is empty for missing or blank input', () => {
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList('   ')).toEqual([]);
  });
});

describe('isAppAllowed', () => {
  const original = process.env.APP_ALLOWED_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_ALLOWED_EMAILS;
    else process.env.APP_ALLOWED_EMAILS = original;
  });

  // The failure that matters most: a missing or mangled env var must never
  // lock the owner out of their own deployment.
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['unparseable', 'not-an-email'],
  ])('admits the owner when APP_ALLOWED_EMAILS is %s', (_label, value) => {
    if (value === undefined) delete process.env.APP_ALLOWED_EMAILS;
    else process.env.APP_ALLOWED_EMAILS = value;

    expect(appAllowedEmails()).toEqual([OWNER]);
    expect(isAppAllowed(OWNER)).toBe(true);
  });

  it('admits the owner however the address is cased or padded', () => {
    delete process.env.APP_ALLOWED_EMAILS;
    expect(isAppAllowed('MMCD.JACK@GMAIL.COM')).toBe(true);
    expect(isAppAllowed('  mmcd.jack@gmail.com ')).toBe(true);
  });

  it('blocks every other account that already exists', () => {
    delete process.env.APP_ALLOWED_EMAILS;
    for (const other of [
      'gvn3pr@virginia.edu',
      'pauliepommeroy@gmail.com',
      'jajaas@gmai.com',
      'olivermolz05@gmail.com',
      'jackmcd2004@gmail.com',
      'tim@pennantcapital.com',
    ]) {
      expect(isAppAllowed(other)).toBe(false);
    }
  });

  it('blocks a session with no address at all', () => {
    expect(isAppAllowed(null)).toBe(false);
    expect(isAppAllowed(undefined)).toBe(false);
    expect(isAppAllowed('')).toBe(false);
  });

  it('honours an explicit list when one is configured', () => {
    process.env.APP_ALLOWED_EMAILS = '"a@x.com", b@y.com';
    expect(isAppAllowed('a@x.com')).toBe(true);
    expect(isAppAllowed('B@Y.COM')).toBe(true);
    // An explicit list replaces the default rather than adding to it.
    expect(isAppAllowed(OWNER)).toBe(false);
  });
});
