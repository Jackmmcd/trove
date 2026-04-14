import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/** POST /api/baskets — record a completed basket purchase */
export async function POST(request: Request) {
  try {
    const { fundId, fundName, budget, orders } = await request.json();
    if (!fundId || !fundName || !budget || !orders) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }
    const record = await prisma.basketPurchase.create({
      data: { fundId, fundName, budget, orders },
    });
    return NextResponse.json({ success: true, data: record });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** GET /api/baskets — list all basket purchases, newest first */
export async function GET() {
  try {
    const baskets = await prisma.basketPurchase.findMany({
      orderBy: { placedAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: baskets });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
