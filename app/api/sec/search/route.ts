import { NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

const UA = process.env.SEC_USER_AGENT || '13F Follower App contact@example.com';

/**
 * GET /api/sec/search?q=renaissance — find 13F filers on EDGAR by name, for
 * funds outside the directory.
 *
 * EDGAR's company autocomplete returns every entity with a matching name —
 * feeder funds, GPs, individuals, unrelated companies — so each candidate's
 * filing history is checked and only those that actually file 13Fs come back.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q || q.length < 3) return NextResponse.json({ success: true, data: [] });

  try {
    const { data } = await axios.get('https://efts.sec.gov/LATEST/search-index', {
      params: { keysTyped: q },
      headers: { 'User-Agent': UA },
      timeout: 8000,
    });
    const hits: { cik: string; name: string }[] = (data?.hits?.hits ?? [])
      .slice(0, 8)
      .map((h: any) => ({ cik: String(h._id).padStart(10, '0'), name: String(h._source?.entity ?? '') }));

    const checked = await Promise.all(hits.map(async h => {
      try {
        const { data: sub } = await axios.get(`https://data.sec.gov/submissions/CIK${h.cik}.json`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          timeout: 8000,
        });
        const r = sub?.filings?.recent;
        const i = (r?.form ?? []).findIndex((f: string) => f === '13F-HR' || f === '13F-HR/A');
        return i < 0 ? null : { cik: h.cik, name: sub.name as string, last13F: r.filingDate[i] as string };
      } catch {
        return null;
      }
    }));

    const results = checked
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.last13F.localeCompare(a.last13F));
    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 502 });
  }
}
