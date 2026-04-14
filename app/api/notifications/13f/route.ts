import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import axios from 'axios';

const USER_AGENT = process.env.SEC_USER_AGENT || '13F Follower App contact@example.com';

interface FilingAlert {
  fundId: string;
  cik: string;
  fundName: string;
  newFilingDate: string;
  newQuarter: string;
  currentQuarter: string | null;
}

function dateToQuarter(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month <= 3) return `${year}-Q1`;
  if (month <= 6) return `${year}-Q2`;
  if (month <= 9) return `${year}-Q3`;
  return `${year}-Q4`;
}

export async function GET() {
  try {
    const funds = await prisma.fund.findMany({ where: { enabled: true } });

    const alerts: FilingAlert[] = [];

    await Promise.all(funds.map(async fund => {
      try {
        const padded = fund.cik.replace(/^0+/, '').padStart(10, '0');
        const res = await axios.get(`https://data.sec.gov/submissions/CIK${padded}.json`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          timeout: 8000,
        });

        const recent = res.data?.filings?.recent;
        if (!recent) return;

        const forms: string[] = recent.form ?? [];
        const dates: string[] = recent.filingDate ?? [];

        // Find latest 13F-HR
        const idx = forms.findIndex(f => f === '13F-HR' || f === '13F-HR/A');
        if (idx === -1) return;

        const latestFilingDate = dates[idx];
        const latestQuarter = dateToQuarter(latestFilingDate);

        // Get what we have stored
        const latestHolding = await prisma.holding.findFirst({
          where: { fundId: fund.id },
          orderBy: { quarter: 'desc' },
          select: { quarter: true },
        });

        const currentQuarter = latestHolding?.quarter ?? null;

        // Alert if EDGAR has a newer quarter than what we've stored
        if (!currentQuarter || latestQuarter > currentQuarter) {
          alerts.push({
            fundId: fund.id,
            cik: fund.cik,
            fundName: fund.name,
            newFilingDate: latestFilingDate,
            newQuarter: latestQuarter,
            currentQuarter,
          });
        }
      } catch { /* skip funds that fail */ }
    }));

    return NextResponse.json({ success: true, data: alerts });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
