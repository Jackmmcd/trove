import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncAllFunds } from '@/lib/services/fund-sync';

export async function GET() {
  try {
    // Get all funds with their latest quarter's holdings
    const funds = await prisma.fund.findMany({ orderBy: { name: 'asc' } });

    // For each fund, find the latest quarter and return its holdings
    const fundsWithHoldings = await Promise.all(
      funds.map(async (fund: (typeof funds)[0]) => {
        const latestHolding = await prisma.holding.findFirst({
          where: { fundId: fund.id },
          orderBy: { quarter: 'desc' },
        });

        const holdings = latestHolding
          ? await prisma.holding.findMany({
              where: { fundId: fund.id, quarter: latestHolding.quarter },
              orderBy: { weight: 'desc' },
            })
          : [];

        const thesisRecord = await prisma.fundThesis.findUnique({ where: { fundId: fund.id } });
        return { ...fund, holdings, thesis: thesisRecord?.thesis ?? null };
      })
    );

    return NextResponse.json({
      success: true,
      data: fundsWithHoldings,
    });
  } catch (error: any) {
    console.error('Error fetching funds:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch funds',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cik, name, enabled = true } = body;

    if (!cik || !name) {
      return NextResponse.json(
        {
          success: false,
          error: 'CIK and name are required',
        },
        { status: 400 }
      );
    }

    const fund = await prisma.fund.create({
      data: {
        cik: cik.padStart(10, '0'),
        name,
        enabled,
      },
    });

    return NextResponse.json({
      success: true,
      data: fund,
    });
  } catch (error: any) {
    console.error('Error creating fund:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create fund',
      },
      { status: 500 }
    );
  }
}

// Sync endpoint
export async function PUT() {
  try {
    const results = await syncAllFunds();
    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    console.error('Error syncing funds:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync funds',
      },
      { status: 500 }
    );
  }
}

