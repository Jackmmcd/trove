import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncFund } from '@/lib/services/fund-sync';

type Params = { params: Promise<{ cik: string }> };

/** DELETE /api/funds/[cik] — remove fund and all its holdings */
export async function DELETE(_req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const fund = await prisma.fund.findUnique({ where: { cik } });
    if (!fund) {
      return NextResponse.json({ success: false, error: 'Fund not found' }, { status: 404 });
    }
    await prisma.holding.deleteMany({ where: { fundId: fund.id } });
    await prisma.fund.delete({ where: { cik } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** PATCH /api/funds/[cik] — toggle enabled / update name */
export async function PATCH(req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const body = await req.json();
    const { enabled, name } = body;

    const data: Record<string, unknown> = {};
    if (typeof enabled === 'boolean') data.enabled = enabled;
    if (typeof name === 'string' && name.trim()) data.name = name.trim();

    const fund = await prisma.fund.update({ where: { cik }, data });
    return NextResponse.json({ success: true, data: fund });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** PUT /api/funds/[cik] — sync this fund's holdings */
export async function PUT(_req: Request, { params }: Params) {
  const { cik } = await params;
  try {
    const result = await syncFund(cik);
    return NextResponse.json({ success: result.success, data: result, error: result.error });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
