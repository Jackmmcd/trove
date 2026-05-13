import { NextResponse } from 'next/server';
import { generateRebalanceTrades } from '@/lib/rebalancing/calculator';
import type { RebalanceConstraints } from '@/lib/rebalancing/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const constraints: RebalanceConstraints = {
      minTradeValue: searchParams.get('minTradeValue')
        ? parseFloat(searchParams.get('minTradeValue')!)
        : undefined,
      maxPositionWeight: searchParams.get('maxPositionWeight')
        ? parseFloat(searchParams.get('maxPositionWeight')!)
        : undefined,
      rebalanceThreshold: searchParams.get('rebalanceThreshold')
        ? parseFloat(searchParams.get('rebalanceThreshold')!)
        : 5, // Default 5%
      minLiquidity: searchParams.get('minLiquidity')
        ? parseFloat(searchParams.get('minLiquidity')!)
        : undefined,
    };

    const result = await generateRebalanceTrades(constraints);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error calculating rebalance:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to calculate rebalance',
      },
      { status: 500 }
    );
  }
}



